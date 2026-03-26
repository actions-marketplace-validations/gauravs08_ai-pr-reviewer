/**
 * Logger
 *
 * Abstraction over @actions/core logging that works in both
 * GitHub Actions mode and standalone CLI mode.
 * Auto-detects environment and routes to appropriate output.
 */
export declare function info(message: string): void;
export declare function warning(message: string): void;
export declare function error(message: string): void;
export declare function setFailed(message: string): void;
export declare function setOutput(name: string, value: string | number): void;
