/**
 * AI Reviewer
 *
 * Orchestrates parallel review tracks using the Claude API (Anthropic SDK).
 * Each track (code-quality, security, cross-file) runs as an independent API call.
 * Includes retry logic with exponential backoff, token budget management,
 * and resilient JSON parsing for Claude's response format.
 */
import { DiffFile } from './diff-parser';
export interface ReviewFinding {
    category: string;
    severity: 'critical' | 'high' | 'medium';
    title: string;
    description: string;
    file: string | null;
    line: number | null;
    lineType: 'ADDED' | 'CONTEXT' | null;
    commentType: 'inline' | 'general';
}
export interface ReviewResult {
    summary: string;
    reviews: ReviewFinding[];
}
export declare class AIReviewer {
    private client;
    private model;
    private maxRetries;
    private timeoutMs;
    constructor(apiKey: string, model: string, maxRetries?: number, timeoutMs?: number);
    /**
     * Run all configured review tracks in parallel and merge results.
     */
    review(files: DiffFile[], tracks: string[], customInstructions: string, maxDiffTokens?: number): Promise<ReviewResult>;
    private buildPrompt;
    private getPrompt;
    /**
     * Run a track with retry and exponential backoff.
     */
    private runTrackWithRetry;
    private runTrack;
    private parseResponse;
    private buildSummary;
}
