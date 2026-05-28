
'use client';

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write' | 'list';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  path: string;
  operation: string;
  requestResourceData?: any;

  constructor(context: SecurityRuleContext) {
    super('Missing or insufficient permissions');
    this.name = 'FirestorePermissionError';
    this.path = context.path;
    this.operation = context.operation;
    this.requestResourceData = context.requestResourceData;
  }
}
