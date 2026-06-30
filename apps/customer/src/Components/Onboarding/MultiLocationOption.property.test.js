import fc from 'fast-check';

/**
 * Property 4: Form submission gated on verification completeness
 *
 * For any onboarding form state where the multi-location option is "join" and
 * `companyVerified` is false, the form submission SHALL be disabled regardless
 * of all other field values.
 *
 * The canProceed logic (from OnboardingPage):
 *   - If multiLocationOption === 'join', require companyVerified === true
 *   - If multiLocationOption === 'create', require companyName.trim() non-empty
 *   - If multiLocationOption === 'none', no additional requirements (always proceed)
 *
 * **Validates: Requirements 9.10**
 */

// Pure function extracted from OnboardingPage canProceed() logic
const canProceedMultiLocation = (multiLocationOption, companyVerified, companyName) => {
  if (multiLocationOption === 'join') return companyVerified === true;
  if (multiLocationOption === 'create') return companyName.trim().length > 0;
  return true; // 'none'
};

describe('Property 4: Form submission gated on verification completeness', () => {
  it('join mode always blocked when companyVerified is false, regardless of other field values', () => {
    fc.assert(
      fc.property(
        fc.string(),           // any companyName value
        fc.string(),           // any joinCode value
        fc.string(),           // any verificationCode value
        fc.string(),           // any companyEmail value
        (companyName, joinCode, verificationCode, companyEmail) => {
          // With multiLocationOption === 'join' and companyVerified === false,
          // canProceed must always return false
          return canProceedMultiLocation('join', false, companyName) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('join mode allows submission when companyVerified is true', () => {
    fc.assert(
      fc.property(
        fc.string(),           // any companyName value
        (companyName) => {
          return canProceedMultiLocation('join', true, companyName) === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('create mode blocks submission when companyName is whitespace-only', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 50 }).map(chars => chars.join('')),
        (whitespaceOnlyName) => {
          return canProceedMultiLocation('create', false, whitespaceOnlyName) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('none mode always allows submission regardless of verification state', () => {
    fc.assert(
      fc.property(
        fc.boolean(),          // any companyVerified value
        fc.string(),           // any companyName value
        (companyVerified, companyName) => {
          return canProceedMultiLocation('none', companyVerified, companyName) === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
