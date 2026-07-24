#!/bin/bash
# Download GitHub Actions artifacts
# Usage: ./scripts/download-artifacts.sh [run-id]

set -e

OUTPUT_DIR="./downloaded-artifacts"

# Get latest run if no ID provided
if [ -z "$1" ]; then
    echo "🔍 Finding latest workflow run..."
    RUN_ID=$(gh run list --workflow=release.yml --limit=1 --json databaseId -q ".[0].databaseId")
    if [ -z "$RUN_ID" ]; then
        echo "❌ No runs found"
        exit 1
    fi
    echo "📋 Latest run ID: $RUN_ID"
else
    RUN_ID=$1
    echo "📋 Using run ID: $RUN_ID"
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Download artifacts
echo "📦 Downloading artifacts..."
echo ""
gh run download "$RUN_ID" -D "$OUTPUT_DIR"

echo ""
echo "✅ Download complete!"
echo ""
echo "📂 Files saved to: $OUTPUT_DIR"
echo ""
ls -lh "$OUTPUT_DIR"
