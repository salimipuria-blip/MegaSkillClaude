// Unit tests get fixed first-login passwords; the app itself draws random ones (initial-passwords.ts).
import { setInitialPasswordProvider } from '../src/core/initial-passwords';

export const FIXTURE_PASSWORDS: Record<string, string> = {
  'u-owner': 'fx-owner-0',
  'u-manager': 'fx-manager-0',
  'u-deputy': 'fx-deputy-0',
  'u-cashier-1': 'fx-cashier-1',
  'u-cashier-2': 'fx-cashier-2',
  'u-cons-1': 'fx-cons-1',
  'u-cons-2': 'fx-cons-2',
  'u-cons-3': 'fx-cons-3',
};

setInitialPasswordProvider((ids) => Object.fromEntries(ids.map((id) => [id, FIXTURE_PASSWORDS[id]])));
