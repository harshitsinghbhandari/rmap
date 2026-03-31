/**
 * Version Management for Delta Updates
 *
 * Manages map version numbers, parent version tracking, and update metadata.
 * Ensures proper version lineage and update history.
 */

import type { MetaJson, Level1Output } from '../core/types.js';
import { SCHEMA_VERSION } from '../core/constants.js';

/**
 * Options for version update
 */
export interface VersionUpdateOptions {
  /** Existing metadata (null for new maps) */
  existingMeta: MetaJson | null;
  /** Level 1 structure output (contains repo info) */
  level1: Level1Output;
  /** New git commit hash */
  newCommitHash: string;
  /** Type of update performed */
  updateType: 'full' | 'delta';
  /** Number of files changed in delta update (null for full) */
  filesChanged: number | null;
}

/**
 * Result of version update
 */
export interface VersionUpdateResult {
  /** New version number */
  mapVersion: number;
  /** Parent version (null for first version) */
  parentVersion: number | null;
  /** Creation timestamp (preserved from original) */
  createdAt: string;
  /** Update timestamp (set to now) */
  lastUpdated: string;
}

/**
 * Update version metadata for a new map build
 *
 * Increments the version number, tracks parent version, and updates timestamps.
 *
 * @param options - Version update options
 * @returns Version metadata for the new map
 */
export function updateVersion(options: VersionUpdateOptions): VersionUpdateResult {
  const { existingMeta, updateType, filesChanged } = options;

  const now = new Date().toISOString();

  // If no existing meta, this is version 1
  if (!existingMeta) {
    return {
      mapVersion: 1,
      parentVersion: null,
      createdAt: now,
      lastUpdated: now,
    };
  }

  // Increment version number
  const newVersion = existingMeta.map_version + 1;

  // Track parent version (the version this was built from)
  const parentVersion = existingMeta.map_version;

  return {
    mapVersion: newVersion,
    parentVersion,
    createdAt: existingMeta.created_at, // Preserve original creation time
    lastUpdated: now,
  };
}

/**
 * Build complete metadata for the map
 *
 * Combines version info, Level 1 output, and update details into complete metadata.
 *
 * @param options - All metadata components
 * @returns Complete MetaJson object
 */
export function buildMetadata(options: {
  versionInfo: VersionUpdateResult;
  level1: Level1Output;
  gitCommit: string;
  updateType: 'full' | 'delta';
  filesChanged: number | null;
}): MetaJson {
  const { versionInfo, level1, gitCommit, updateType, filesChanged } = options;

  return {
    schema_version: SCHEMA_VERSION,
    map_version: versionInfo.mapVersion,
    git_commit: gitCommit,
    created_at: versionInfo.createdAt,
    last_updated: versionInfo.lastUpdated,
    parent_version: versionInfo.parentVersion,
    update_type: updateType,
    files_changed: filesChanged,
    repo_name: level1.repo_name,
    purpose: level1.purpose,
    stack: level1.stack,
    languages: level1.languages,
    entrypoints: level1.entrypoints,
    modules: level1.modules,
    config_files: level1.config_files,
    conventions: level1.conventions,
  };
}

/**
 * Get version history summary
 *
 * Provides a human-readable summary of the version lineage.
 *
 * @param meta - Current metadata
 * @returns Version history description
 */
export function getVersionHistory(meta: MetaJson): string {
  if (meta.map_version === 1) {
    return 'Initial version';
  }

  const lines: string[] = [];

  lines.push(`Version ${meta.map_version}`);

  if (meta.parent_version) {
    lines.push(`Built from version ${meta.parent_version}`);
  }

  lines.push(`Update type: ${meta.update_type}`);

  if (meta.update_type === 'delta' && meta.files_changed !== null) {
    lines.push(`Files changed: ${meta.files_changed}`);
  }

  const created = new Date(meta.created_at);
  const updated = new Date(meta.last_updated);
  const ageMs = updated.getTime() - created.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  lines.push(`Map age: ${ageDays} days`);

  return lines.join('\n');
}

/**
 * Check if a version update is needed
 *
 * Compares git commits to determine if the map needs updating.
 *
 * @param meta - Current metadata
 * @param currentCommit - Current HEAD commit hash
 * @returns True if update is needed
 */
export function needsUpdate(meta: MetaJson | null, currentCommit: string): boolean {
  if (!meta) {
    return true; // No map exists
  }

  return meta.git_commit !== currentCommit;
}

/**
 * Format version for display
 *
 * Creates a short version string for CLI output.
 *
 * @param meta - Metadata to format
 * @returns Formatted version string
 */
export function formatVersionString(meta: MetaJson): string {
  const parts: string[] = [`v${meta.map_version}`];

  if (meta.update_type === 'delta') {
    parts.push('(delta)');
  }

  if (meta.parent_version) {
    parts.push(`← v${meta.parent_version}`);
  }

  return parts.join(' ');
}

/**
 * Get version comparison between two metadata objects
 *
 * Compares two map versions and describes the differences.
 *
 * @param oldMeta - Previous metadata
 * @param newMeta - Current metadata
 * @returns Comparison description
 */
export function compareVersions(oldMeta: MetaJson, newMeta: MetaJson): {
  versionDiff: number;
  updatesSinceOld: number;
  description: string;
} {
  const versionDiff = newMeta.map_version - oldMeta.map_version;

  let updatesSinceOld = 1;
  let current = newMeta;

  // Walk back through parent versions to count updates
  // (This would require reading previous meta files, simplified here)
  // In practice, the difference in version numbers is the count

  const description =
    versionDiff === 1
      ? 'Latest version (1 update)'
      : `${versionDiff} versions newer (${versionDiff} updates)`;

  return {
    versionDiff,
    updatesSinceOld: versionDiff,
    description,
  };
}

/**
 * Bump map version and set parent version
 *
 * Simple helper to increment version tracking.
 *
 * @param currentVersion - Current map version
 * @returns New version and parent version
 */
export function bumpVersion(currentVersion: number | null): {
  newVersion: number;
  parentVersion: number | null;
} {
  if (currentVersion === null) {
    return {
      newVersion: 1,
      parentVersion: null,
    };
  }

  return {
    newVersion: currentVersion + 1,
    parentVersion: currentVersion,
  };
}

/**
 * Validate version consistency
 *
 * Ensures version numbers are sequential and parent_version is valid.
 *
 * @param meta - Metadata to validate
 * @returns True if version info is consistent
 */
export function validateVersionConsistency(meta: MetaJson): boolean {
  // Version must be positive
  if (meta.map_version < 1) {
    console.warn('Invalid map version: must be >= 1');
    return false;
  }

  // First version should have no parent
  if (meta.map_version === 1 && meta.parent_version !== null) {
    console.warn('First version should not have a parent version');
    return false;
  }

  // Later versions should have parent
  if (meta.map_version > 1 && meta.parent_version === null) {
    console.warn('Version > 1 should have a parent version');
    return false;
  }

  // Parent version must be less than current
  if (meta.parent_version !== null && meta.parent_version >= meta.map_version) {
    console.warn('Parent version must be less than current version');
    return false;
  }

  // Delta updates must have files_changed
  if (meta.update_type === 'delta' && meta.files_changed === null) {
    console.warn('Delta updates must specify files_changed');
    return false;
  }

  // Full rebuilds should not have files_changed
  if (meta.update_type === 'full' && meta.files_changed !== null) {
    console.warn('Full rebuilds should not have files_changed set');
    return false;
  }

  return true;
}
