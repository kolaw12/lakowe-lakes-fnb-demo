/** Statement amounts are integer kobo, including CSV amounts. */
export type StatementRow = {
  reference: string;
  orderReference: string;
  outlet: string;
  amount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
};

export type StatementResponse = {
  rows: StatementRow[];
  total: number;
  from: string | null;
  to: string | null;
  generatedAt: string;
  coverage: string;
};
