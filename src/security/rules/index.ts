import { shellInjectionRule } from './shell-injection.js'
import { envExfiltrationRule } from './env-exfiltration.js'
import { promptInjectionRule } from './prompt-injection.js'
import { embeddedSecretsRule } from './embedded-secrets.js'
import type { ScanRule } from '../scanner.js'

export const ALL_RULES: ScanRule[] = [
  shellInjectionRule,
  envExfiltrationRule,
  promptInjectionRule,
  embeddedSecretsRule,
]
