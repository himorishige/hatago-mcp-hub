/**
 * Protocol Management Module
 * Exports all protocol-related functionality
 */

export {
  detectFeatures,
  getBaseFeatures,
  hasFeature,
  type ProtocolFeatures,
  type ServerCapabilities,
} from './feature-detector.js';
export {
  adaptRequest,
  adaptResponse,
} from './protocol-adapter.js';
export {
  compareVersions,
  getInitProtocol,
  isDateBasedVersion,
  isSemanticVersion,
  isSupported,
  SUPPORTED_PROTOCOLS,
  type SupportedProtocol,
  selectCompatibleVersion,
} from './protocol-version.js';
