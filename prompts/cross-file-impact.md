# Cross-File Impact Analysis

Analyze the PR diff for changes that may break or require updates in other files:

## API Contracts
- Changed function signatures (added/removed/retyped parameters)
- Changed return types or response shapes
- Changed HTTP endpoint paths, methods, or status codes
- Changed request/response DTOs or interfaces

## Shared Types
- Modified interfaces, types, or classes used by multiple files
- Changed enum values that others may switch on
- Changed constants or configuration keys

## Database
- Schema changes without migration scripts
- Changed column names/types referenced elsewhere
- New required fields without defaults

## Configuration
- New environment variables without documentation
- Changed config keys without updating all consumers

## Test Coverage
- Changed business logic without corresponding test updates
- New branches/conditions without test coverage

For each finding, identify WHICH other files might be affected and WHY.
Set commentType to "general" and file/line to null for cross-file findings.
