export const signupCopyKeys = [
  'title', 'subtitle', 'requiredFieldsHint',
  'nameLabel', 'namePlaceholder', 'emailLabel', 'emailPlaceholder',
  'businessNameLabel', 'businessNamePlaceholder', 'phoneLabel', 'phoneHint',
  'passwordLabel', 'confirmPasswordLabel',
  'byaanNotice', 'verificationSent', 'verificationDeferred', 'signupFailed', 'signupRateLimited',
  'passwordMismatch', 'passwordMinimumError', 'passwordUppercaseError',
  'passwordNumberError', 'phoneRequiredError', 'legalRequiredError',
  'showPassword', 'hidePassword', 'showConfirmPassword', 'hideConfirmPassword',
  'passwordRequirementsLabel', 'passwordMinimum', 'passwordUppercase',
  'passwordNumber', 'requirementMet', 'requirementPending',
  'legalGroupLabel', 'termsPrefix', 'termsLink', 'privacyPrefix', 'privacyLink',
  'marketingConsent', 'opensInNewTab', 'submitting', 'submit', 'hasAccount',
  'signIn', 'countrySelector', 'phoneInputLabel',
  'countrySA', 'countryAE', 'countryKW', 'countryBH', 'countryQA', 'countryOM',
  'countryEG', 'countryJO', 'countryIQ', 'countryYE', 'countrySD', 'countryLY',
] as const;

type CopySection<Keys extends readonly string[]> = Record<Keys[number], string>;

export type AuthUxCopy = {
  signup: CopySection<typeof signupCopyKeys>;
};

export function flattenAuthUxKeys(copy: AuthUxCopy): string[] {
  return Object.entries(copy).flatMap(([section, values]) =>
    Object.keys(values).map((key) => `${section}.${key}`),
  ).sort();
}
