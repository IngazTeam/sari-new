import { signupFields, signupErrorText, validateSignup, type SignupField, type SignupFieldErrors } from '@shared/signup-validation';

const accountFields: SignupField[] = ['name', 'businessName', 'email', 'phone'];

export function wireSignupFields(form: HTMLFormElement, language: string, showStep: (step: number) => void) {
  let errors: SignupFieldErrors = {};
  let rejectedValues: Record<string, unknown> = {};
  const touched = new Set<SignupField>();
  const input = (field: SignupField) => form.elements.namedItem(field) as HTMLInputElement;
  const feedback = form.querySelector<HTMLElement>('#form-feedback')!;
  const values = () => Object.fromEntries(signupFields.map(field => [field,
    input(field).type === 'checkbox' ? input(field).checked : input(field).value,
  ]));
  const paint = () => {
    for (const field of signupFields) {
      const code = errors[field];
      const hint = form.querySelector<HTMLElement>(`#${field}-error`)!;
      hint.textContent = code ? signupErrorText(code, language) : '';
      hint.hidden = !code;
      input(field).setAttribute('aria-invalid', String(!!code));
    }
    if (!Object.keys(errors).length && feedback.dataset.fieldErrors) {
      feedback.textContent = '';
      delete feedback.dataset.fieldErrors;
    }
  };
  const applyErrors = (next: SignupFieldErrors) => {
    errors = next;
    rejectedValues = values();
    paint();
    const first = signupFields.find(field => errors[field]);
    if (!first) return;
    feedback.textContent = language === 'ar' ? 'راجع الخانات الموضحة أدناه.' : 'Check the highlighted fields below.';
    feedback.dataset.fieldErrors = 'true';
    feedback.setAttribute('role', 'alert');
    signupFields.filter(field => errors[field]).forEach(field => touched.add(field));
    showStep(accountFields.includes(first) ? 1 : 2);
    input(first).focus();
  };
  for (const field of signupFields) {
    const control = input(field);
    const hint = document.createElement('p');
    hint.id = `${field}-error`;
    hint.className = 'signup-field-error';
    hint.hidden = true;
    hint.setAttribute('aria-live', 'polite');
    (control.closest('.page-field') || control.closest('label'))!.insertAdjacentElement('afterend', hint);
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));
    if (field === 'password') control.setAttribute('aria-describedby', `signup-password-hint ${hint.id}`);
    control.setAttribute('aria-invalid', 'false');
    const revalidate = () => {
      const next = validateSignup(values());
      const unchangedConflict = (errors[field] === 'emailUsed' || errors[field] === 'phoneUsed') && rejectedValues[field] === control.value;
      if (!unchangedConflict && (touched.has(field) || errors[field])) {
        if (next[field]) errors[field] = next[field];
        else delete errors[field];
      }
      if (field === 'password' && touched.has('confirmPassword')) {
        if (next.confirmPassword) errors.confirmPassword = next.confirmPassword;
        else delete errors.confirmPassword;
      }
      paint();
    };
    control.addEventListener('blur', event => {
      touched.add(field);
      // Do not move a button/checkbox under the pointer between pointerdown
      // and click. The submit/next handler will validate every relevant field.
      const target = event.relatedTarget as HTMLElement | null;
      if (target?.closest?.('button, a, input[type="checkbox"]')) return;
      revalidate();
    });
    control.addEventListener('input', revalidate);
    control.addEventListener('change', revalidate);
  }
  form.noValidate = true;
  return {
    applyErrors,
    validate(step?: number) {
      const next = validateSignup(values());
      const fields = step === 1 ? accountFields : signupFields;
      const selected: SignupFieldErrors = {};
      for (const field of fields) {
        touched.add(field);
        if (next[field]) selected[field] = next[field];
      }
      applyErrors(selected);
      return Object.keys(selected).length === 0;
    },
  };
}
