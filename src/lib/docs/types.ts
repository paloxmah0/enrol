export type ProtocolRelationship = {
  from: string;
  to: string;
  type: string;
  cardinality: string;
};

export type ProtocolNode = {
  schema: Record<string, unknown>;
  commitSha: string;
};

export type ProtocolChannelPayload = {
  domain: string;
  version: string;
  commitSha: string;
  nodes: Record<string, ProtocolNode>;
  subgraph: {
    relationships: ProtocolRelationship[];
  };
};
