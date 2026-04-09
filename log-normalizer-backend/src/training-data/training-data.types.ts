export interface TrainingExportRecord {
  id: string;
  exportedAt: Date;
  exportedByEmail: string;
  recordCount: number;
}

export interface TrainingDataStats {
  totalCorrections: number;
  pendingExport: number;
  alreadyExported: number;
  lastExportAt: Date | null;
  exportHistory: TrainingExportRecord[];
}

export interface TrainingExportResult {
  jsonl: string;
  recordCount: number;
  exportId: string;
}

export class NoCorrectionsToExportError extends Error {
  constructor() {
    super('No corrections available to export');
    this.name = 'NoCorrectionsToExportError';
  }
}
