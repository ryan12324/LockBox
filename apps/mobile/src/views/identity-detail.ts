/**
 * Identity detail/edit screen utilities — field definitions, sections,
 * and data transformation for viewing/editing identity items.
 *
 * Fields are organized into display sections:
 * - Personal: firstName, middleName, lastName, email, phone
 * - Address: address1, address2, city, state, postalCode, country
 * - Company: company
 * - IDs: ssn (masked), passportNumber, licenseNumber
 */

/** Single field definition for the identity detail view */
export interface IdentityFieldDef {
  key: string;
  label: string;
  masked: boolean;
  inputType: 'text' | 'email' | 'tel';
}

/** Section grouping for identity detail display */
export interface IdentitySection {
  title: string;
  fields: IdentityFieldDef[];
}

/** All identity data fields for editing */
export interface IdentityFormData {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  company: string;
  ssn: string;
  passportNumber: string;
  licenseNumber: string;
}

/** Personal information section fields */
const personalFields: IdentityFieldDef[] = [
  { key: 'firstName', label: 'First Name', masked: false, inputType: 'text' },
  { key: 'middleName', label: 'Middle Name', masked: false, inputType: 'text' },
  { key: 'lastName', label: 'Last Name', masked: false, inputType: 'text' },
  { key: 'email', label: 'Email', masked: false, inputType: 'email' },
  { key: 'phone', label: 'Phone', masked: false, inputType: 'tel' },
];

/** Address section fields */
const addressFields: IdentityFieldDef[] = [
  { key: 'address1', label: 'Address 1', masked: false, inputType: 'text' },
  { key: 'address2', label: 'Address 2', masked: false, inputType: 'text' },
  { key: 'city', label: 'City', masked: false, inputType: 'text' },
  { key: 'state', label: 'State / Province', masked: false, inputType: 'text' },
  { key: 'postalCode', label: 'Postal Code', masked: false, inputType: 'text' },
  { key: 'country', label: 'Country', masked: false, inputType: 'text' },
];

/** Company section fields */
const companyFields: IdentityFieldDef[] = [
  { key: 'company', label: 'Company', masked: false, inputType: 'text' },
];

/** Identification numbers section fields — ssn is masked by default */
const idFields: IdentityFieldDef[] = [
  { key: 'ssn', label: 'Social Security Number', masked: true, inputType: 'text' },
  { key: 'passportNumber', label: 'Passport Number', masked: false, inputType: 'text' },
  { key: 'licenseNumber', label: 'License Number', masked: false, inputType: 'text' },
];

/**
 * Get all identity sections with their field definitions.
 * Used to render grouped fields in the detail/edit screen.
 */
export function getIdentitySections(): IdentitySection[] {
  return [
    { title: 'Personal', fields: personalFields },
    { title: 'Address', fields: addressFields },
    { title: 'Company', fields: companyFields },
    { title: 'IDs', fields: idFields },
  ];
}

/** All identity field keys for iteration */
export const identityFieldKeys: ReadonlyArray<keyof IdentityFormData> = [
  'firstName',
  'middleName',
  'lastName',
  'email',
  'phone',
  'address1',
  'address2',
  'city',
  'state',
  'postalCode',
  'country',
  'company',
  'ssn',
  'passportNumber',
  'licenseNumber',
];

/**
 * Create an empty identity form data object.
 */
export function createEmptyIdentityForm(): IdentityFormData {
  return {
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    company: '',
    ssn: '',
    passportNumber: '',
    licenseNumber: '',
  };
}

/**
 * Extract identity form data from a raw decrypted object.
 * Safely handles missing/undefined fields.
 */
export function extractIdentityFormData(raw: Record<string, unknown>): IdentityFormData {
  const form = createEmptyIdentityForm();
  for (const key of identityFieldKeys) {
    const value = raw[key];
    if (typeof value === 'string') {
      form[key] = value;
    }
  }
  return form;
}

/**
 * Mask a sensitive value for display (e.g., SSN).
 * Shows only the last 4 characters, replacing the rest with bullets.
 * Returns empty string for empty/undefined values.
 */
export function maskSensitiveValue(value: string | undefined): string {
  if (!value || value.length === 0) return '';
  if (value.length <= 4) return '••••';
  return '•'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * Check whether an identity form has any non-empty fields.
 * Used to determine whether to show "empty identity" state.
 */
export function hasIdentityData(form: IdentityFormData): boolean {
  return identityFieldKeys.some((key) => form[key].length > 0);
}

/**
 * Get a display-friendly summary of an identity (for preview/list).
 * Returns "First Last" or email or company, in priority order.
 */
export function getIdentitySummary(form: IdentityFormData): string {
  const name = [form.firstName, form.lastName].filter(Boolean).join(' ');
  return name || form.email || form.company || 'Empty identity';
}
