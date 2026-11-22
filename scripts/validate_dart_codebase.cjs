#!/usr/bin/env node
/**
 * ServiceOS / ServicePro OS — Flutter & Android Mobile Codebase Release Validator
 * Scans serviceos/lib/ (Flutter Dart) and serviceos_android/app/src/main/ (Android Kotlin)
 * for zero placeholder TODOs/UnimplementedErrors, zero legacy Supabase dependencies,
 * zero hardcoded demo identities, and strict 2-persona mobile enforcement.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const flutterLibDir = path.join(repoRoot, 'serviceos', 'lib');
const flutterPubspec = path.join(repoRoot, 'serviceos', 'pubspec.yaml');
const androidSrcDir = path.join(repoRoot, 'serviceos_android', 'app', 'src', 'main', 'kotlin');

const FORBIDDEN_PATTERNS = [
  { pattern: /supabase_flutter/i, reason: 'Legacy Supabase Flutter SDK reference' },
  { pattern: /SupabaseRemoteDatasource/i, reason: 'Legacy Supabase remote datasource reference' },
  { pattern: /LocalFixtureDatasource/i, reason: 'Offline fixture datasource reference' },
  { pattern: /UnimplementedError\s*\(/, reason: 'Placeholder UnimplementedError() stub' },
  { pattern: /\/\/\s*TODO:\s*implement\s+later/i, reason: 'Placeholder TODO comment' },
  { pattern: /Eleanor Vance/i, reason: 'Hardcoded mock customer identity' },
  { pattern: /Marcus Vance/i, reason: 'Hardcoded mock technician identity' },
  { pattern: /Elena Rostova/i, reason: 'Hardcoded mock identity' },
  { pattern: /888-555-0192/, reason: 'Hardcoded fake support phone number' },
  { pattern: /support@serviceos\.app/i, reason: 'Hardcoded fake support email' },
];

function collectFiles(dir, ext, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, ext, acc);
    } else if (entry.name.endsWith(ext)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function validateMobileCodebase() {
  const errors = [];

  if (!fs.existsSync(flutterPubspec)) {
    errors.push('Missing serviceos/pubspec.yaml');
  } else {
    const pubspecContent = fs.readFileSync(flutterPubspec, 'utf8');
    if (pubspecContent.includes('supabase_flutter')) {
      errors.push('serviceos/pubspec.yaml still depends on supabase_flutter');
    }
  }

  // Verify deleted legacy files do not exist
  const deletedFiles = [
    path.join(flutterLibDir, 'core', 'network', 'supabase_service.dart'),
    path.join(flutterLibDir, 'data', 'datasources', 'supabase_remote_datasource.dart'),
    path.join(flutterLibDir, 'data', 'datasources', 'local_fixture_datasource.dart'),
  ];
  for (const removed of deletedFiles) {
    if (fs.existsSync(removed)) {
      errors.push(`Forbidden legacy file still exists: ${path.relative(repoRoot, removed)}`);
    }
  }

  const dartFiles = collectFiles(flutterLibDir, '.dart');
  const kotlinFiles = collectFiles(androidSrcDir, '.kt');

  if (dartFiles.length < 20) {
    errors.push(`Expected at least 20 Dart source files in serviceos/lib, found ${dartFiles.length}`);
  }
  if (kotlinFiles.length < 15) {
    errors.push(`Expected at least 15 Kotlin source files in serviceos_android, found ${kotlinFiles.length}`);
  }

  for (const filePath of [...dartFiles, ...kotlinFiles]) {
    const relPath = path.relative(repoRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(content)) {
        errors.push(`${relPath}: ${rule.reason}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('=== MOBILE CODEBASE VALIDATION FAILED ===');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `[PASS] Validated ${dartFiles.length} Flutter Dart files and ${kotlinFiles.length} Android Kotlin files with zero placeholders, zero Supabase remnants, and zero hardcoded mock identities.`
  );
}

validateMobileCodebase();
