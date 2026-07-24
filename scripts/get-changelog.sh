#!/bin/bash
# Get changelog for a specific version
# Usage: ./scripts/get-changelog.sh [version]
# Example: ./scripts/get-changelog.sh v2.0.0-beta.1

VERSION="${1:-Unreleased}"

# Remove 'v' prefix if present
VERSION="${VERSION#v}"

echo "📋 Changelog for version: $VERSION"
echo "=========================================="

# Use Node.js script
node scripts/extract-changelog.js "$VERSION"
