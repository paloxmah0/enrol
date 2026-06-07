import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { handleError, isValidSignature } from '@/lib/utils';

// Ensure Node.js runtime since we rely on 'crypto'
export const runtime = 'nodejs';

/**
 * Find a field in the fields array by its label (exact or partial match)
 */
function findFieldByLabel(fields: any[], label: string): any | null {
  if (!fields || !Array.isArray(fields)) return null;
  return fields.find(field => field?.label?.includes(label)) || null;
}

/**
 * Normalize email for comparison (lowercase, trim)
 */
function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.toLowerCase().trim();
}

/**
 * Normalize phone for comparison (remove spaces, handle + prefix consistently)
 */
function normalizePhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  // Remove all spaces and ensure consistent formatting
  return phone.replace(/\s+/g, '').trim();
}

/**
 * Extract all team member email-phone pairs from a record
 * Looks for patterns "N: Email" and "N: Phone number" where N is 1-9
 */
function extractTeamMemberPairs(record: any): Array<{email: string, phone: string}> {
  const pairs: Array<{email: string, phone: string}> = [];
  
  if (!record?.data?.fields || !Array.isArray(record.data.fields)) {
    return pairs;
  }

  // Look for team members numbered 1-9
  for (let i = 1; i <= 9; i++) {
    const emailField = findFieldByLabel(record.data.fields, `${i}: Email`);
    const phoneField = findFieldByLabel(record.data.fields, `${i}: Phone number`);
    
    if (emailField?.value && phoneField?.value) {
      const email = normalizeEmail(emailField.value);
      const phone = normalizePhone(phoneField.value);
      
      if (email && phone) {
        pairs.push({ email, phone });
      }
    }
  }
  
  return pairs;
}

export async function POST(request: NextRequest) {
  logger.info('Team update webhook triggered.');

  try {
    const receivedSignature = request.headers.get('tally-signature') || '';
    const rawBody = await request.text();

    if (!isValidSignature(rawBody, receivedSignature)) {
      logger.warn('Invalid webhook signature');
      return new NextResponse('Invalid signature.', { status: 401 });
    }

    logger.info('Signature valid.');

    let json;
    try {
      json = JSON.parse(rawBody);
    } catch (err) {
      logger.error('Invalid JSON in request body', { err });
      return new NextResponse('Invalid JSON', { status: 400 });
    }

    // Validate payload structure
    if (!json.data || !json.data.fields || !Array.isArray(json.data.fields)) {
      logger.error('Invalid payload structure: missing data.fields');
      return new NextResponse('Invalid payload structure', { status: 400 });
    }

    // Extract submitter's email and phone
    const submitterEmailField = findFieldByLabel(json.data.fields, 'Email of person filling this form');
    const submitterPhoneField = findFieldByLabel(json.data.fields, 'Phone number of person filling this form');
    
    if (!submitterEmailField?.value || !submitterPhoneField?.value) {
      logger.error('Missing submitter email or phone in update payload');
      return new NextResponse('Missing required fields: email and phone', { status: 400 });
    }

    const submitterEmail = normalizeEmail(submitterEmailField.value);
    const submitterPhone = normalizePhone(submitterPhoneField.value);

    // Extract previous record submissionId from "Team ID" field
    // The "Team ID" field in the update form contains the submissionId of the previous record
    const teamIdField = findFieldByLabel(json.data.fields, 'Team ID');
    
    if (!teamIdField?.value) {
      logger.error('Missing Team ID field in update payload');
      return new NextResponse('Missing required field: Team ID', { status: 400 });
    }

    const previousSubmissionId = String(teamIdField.value);
    logger.info(`Team ID (previous submissionId): ${previousSubmissionId}`);

    logger.info(`Looking for previous record with submissionId: ${previousSubmissionId}`);

    // Fetch all records from Redis
    const rawMessages = await redis.lrange('enrolment-participants-teams', 0, -1);
    
    // Parse and find the previous record by submissionId
    let previousRecord: any = null;
    
    for (const raw of rawMessages) {
      try {
        const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
        
        // Check if this record matches the submissionId we're looking for
        if (record.data?.submissionId === previousSubmissionId || 
            record.data?.responseId === previousSubmissionId) {
          previousRecord = record;
          break;
        }
      } catch (err) {
        logger.warn('Failed to parse record from Redis', { err });
        continue;
      }
    }

    if (!previousRecord) {
      logger.error(`Previous record not found for submissionId: ${previousSubmissionId}`);
      return new NextResponse('Previous record not found', { status: 404 });
    }

    logger.info(`Found previous record: ${previousRecord.data?.submissionId || previousRecord.data?.responseId}`);

    // Extract team member email-phone pairs from previous record
    const teamMemberPairs = extractTeamMemberPairs(previousRecord);
    
    if (teamMemberPairs.length === 0) {
      logger.warn('No team member pairs found in previous record');
    }

    // Validate authorization: check if submitter's email-phone pair exists in team members
    const isAuthorized = teamMemberPairs.some(
      pair => pair.email === submitterEmail && pair.phone === submitterPhone
    );

    if (!isAuthorized) {
      logger.warn(`Authorization failed for email: ${submitterEmail}, phone: ${submitterPhone}`);
      return new NextResponse('Unauthorized: email-phone pair not found in team members', { status: 403 });
    }

    logger.info('Authorization successful');

    // Create merged record: start with deep copy of previous record
    const mergedRecord = JSON.parse(JSON.stringify(previousRecord));

    // Override fields that exist in the update payload
    // Match by label since update form may have different question keys
    for (const updateField of json.data.fields) {
      if (!updateField.label) continue;

      // Find matching field in previous record by label (exact match)
      const existingFieldIndex = mergedRecord.data.fields.findIndex(
        (f: any) => f.label === updateField.label
      );

      if (existingFieldIndex >= 0) {
        // Only update if the new value is not null/empty
        // This preserves existing values when update form doesn't provide a new value
        if (updateField.value !== null && updateField.value !== undefined && updateField.value !== '') {
          mergedRecord.data.fields[existingFieldIndex].value = updateField.value;
        }
        // Update the key to reflect the update form's question key
        // This helps track which form version the field came from
        mergedRecord.data.fields[existingFieldIndex].key = updateField.key;
        // Update type if it changed
        if (updateField.type) {
          mergedRecord.data.fields[existingFieldIndex].type = updateField.type;
        }
        // Update options if they exist (for dropdowns, multi-select, etc.)
        if (updateField.options) {
          mergedRecord.data.fields[existingFieldIndex].options = updateField.options;
        }
      } else {
        // Only add new fields that don't exist in previous record
        // (This should be rare, but handles cases where update form has completely new fields)
        mergedRecord.data.fields.push(updateField);
      }
    }

    // Add previous-team-state field at the top level
    mergedRecord['previous-team-state'] = previousRecord.data?.submissionId || previousRecord.data?.responseId;

    // Update metadata from update payload
    mergedRecord.eventId = json.eventId;
    mergedRecord.createdAt = json.createdAt;
    mergedRecord.data.responseId = json.data.responseId;
    mergedRecord.data.submissionId = json.data.submissionId;
    mergedRecord.data.respondentId = json.data.respondentId;
    mergedRecord.data.formId = json.data.formId;
    mergedRecord.data.formName = json.data.formName;
    mergedRecord.data.createdAt = json.data.createdAt;

    // Push the merged record to Redis
    await redis.lpush('enrolment-participants-teams', JSON.stringify(mergedRecord));
    logger.info(`Team update queued. SubmissionId: ${mergedRecord.data.submissionId}, Previous: ${mergedRecord['previous-team-state']}`);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    logger.error('Team update webhook error', { error });
    return handleError(error);
  }
}

// Some providers probe with HEAD before sending POST
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

// Gracefully handle OPTIONS if a preflight occurs
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
