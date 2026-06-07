import { initDriver } from '@/lib/db/neo4j';
import { logger } from '@/lib/logger';
import type { ResolveContext, SchemaResolveResult } from '../types';

function nodeSchemaCommitShas(result: SchemaResolveResult): Record<string, string> {
  return Object.fromEntries(
    Object.entries(result.protocol.nodes).map(([key, node]) => [key, node.commitSha])
  );
}

export async function persistRoleGraph(
  ctx: ResolveContext,
  result: SchemaResolveResult
): Promise<void> {
  const driver = await initDriver();
  const session = driver.session({ database: 'neo4j' });

  const roleSnapshotExtracted = result.extractedByNode.role_snapshot ?? {};
  const commitShas = nodeSchemaCommitShas(result);

  const params = {
    entryId: ctx.entryId,
    schemaChannel: result.schemaChannel,
    protocolDomain: result.protocol.domain,
    protocolVersion: result.protocol.version,
    protocolCommitSha: result.protocol.commitSha,
    nodeSchemaCommitShasJson: JSON.stringify(commitShas),
    protocolNodesJson: JSON.stringify(
      Object.fromEntries(
        Object.entries(result.protocol.nodes).map(([key, node]) => [key, node.schema])
      )
    ),
    extractedByNodeJson: JSON.stringify(result.extractedByNode),
    sourceKind: result.sourceKind,
    roleSnapshotExtractedJson: JSON.stringify(roleSnapshotExtracted),
  };

  try {
    await session.writeTransaction(async (tx) => {
      await tx.run(
        `
        MATCH (e:Entry { id: $entryId })
        OPTIONAL MATCH (snap:RoleSnapshot)-[:FOR_ENTRY]->(e)
        DETACH DELETE snap
        `,
        { entryId: ctx.entryId }
      );

      const roleResult = await tx.run(
        `
        MATCH (e:Entry { id: $entryId })-[:SENT_BY]->(p:Participant)
        MATCH (e)-[:FROM_CHAT]->(c:TelegramChat)
        MERGE (r:Role { participantHandle: p.handle })
        ON CREATE SET
          r.id = randomUUID(),
          r.createdAt = datetime()
        SET r.updatedAt = datetime()
        MERGE (p)-[:HOLDS]->(r)
        CREATE (snap:RoleSnapshot {
          id: randomUUID(),
          entryId: $entryId,
          recordedAt: datetime(),
          schemaChannel: $schemaChannel,
          protocolDomain: $protocolDomain,
          protocolVersion: $protocolVersion,
          protocolCommitSha: $protocolCommitSha,
          nodeSchemaCommitShas: $nodeSchemaCommitShasJson,
          protocolNodes: $protocolNodesJson,
          extractedByNode: $extractedByNodeJson,
          sourceKind: $sourceKind,
          extracted: $roleSnapshotExtractedJson
        })
        MERGE (snap)-[:ITERATION_OF]->(r)
        MERGE (snap)-[:FOR_ENTRY]->(e)
        WITH r, c, snap
        OPTIONAL MATCH (:TelegramChat)-[oldOrgRel:FOR_ORGANISATION]->(r)
        DELETE oldOrgRel
        MERGE (c)-[:FOR_ORGANISATION]->(r)
        RETURN r.id AS roleId, snap.id AS snapshotId
        `,
        params
      );

      logger.info('Persisted enrolment role graph', {
        entryId: ctx.entryId,
        roleId: roleResult.records[0]?.get('roleId'),
        snapshotId: roleResult.records[0]?.get('snapshotId'),
        protocolDomain: result.protocol.domain,
        protocolVersion: result.protocol.version,
        protocolCommitSha: result.protocol.commitSha,
        chatLinked: true,
      });
    });
  } finally {
    await session.close();
  }
}
