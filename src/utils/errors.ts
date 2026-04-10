export class AgentpullError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'AgentpullError'
  }
}

export class ConfigError extends AgentpullError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR')
    this.name = 'ConfigError'
  }
}

export class ManifestError extends AgentpullError {
  constructor(message: string) {
    super(message, 'MANIFEST_ERROR')
    this.name = 'ManifestError'
  }
}

export class RegistryError extends AgentpullError {
  constructor(message: string) {
    super(message, 'REGISTRY_ERROR')
    this.name = 'RegistryError'
  }
}

export class DownloadError extends AgentpullError {
  constructor(message: string) {
    super(message, 'DOWNLOAD_ERROR')
    this.name = 'DownloadError'
  }
}

export class SecurityError extends AgentpullError {
  constructor(message: string) {
    super(message, 'SECURITY_ERROR')
    this.name = 'SecurityError'
  }
}

export class AuthError extends AgentpullError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR')
    this.name = 'AuthError'
  }
}

export class ConflictError extends AgentpullError {
  constructor(
    message: string,
    public readonly conflictingFiles: string[],
  ) {
    super(message, 'CONFLICT_ERROR')
    this.name = 'ConflictError'
  }
}
