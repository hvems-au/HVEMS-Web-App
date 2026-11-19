/** Document types (matches the documents.category check). Plain module: safe on server and client. */
export const DOCUMENT_CATEGORIES = {
  registration: "Registration",
  insurance: "Insurance",
  service_record: "Service record",
  inspection_report: "Inspection report",
  warranty: "Warranty",
  manual: "Manual",
  certificate: "Certificate",
  photo: "Photo",
  other: "Other",
} as const;
export type DocCategory = keyof typeof DOCUMENT_CATEGORIES;
