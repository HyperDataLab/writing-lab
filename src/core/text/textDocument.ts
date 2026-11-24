export type TextDocument = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
};

export function createTextDocument(input: {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}): TextDocument {
  return {
    ...input,
    updatedAt: input.createdAt,
    schemaVersion: 1,
  };
}
