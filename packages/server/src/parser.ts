// This file re-exports from the modularized parsers/ directory for backward compatibility.
// New code should import directly from the specific parser module.
export {
  parseTeamConfig,
  parseTaskFile,
  inferRole,
  teamMemberToAgent,
  parseTranscriptLine,
  extractToolUseBlocks,
  extractAgentName,
  parseSendMessageInput,
  describeToolAction,
  parseSessionMetadata,
  cleanProjectName,
  extractRecordType,
  readNewLines,
  detectGitWorktree,
  detectGitStatus,
  clearGitStatusCache,
} from './parsers';

export type {
  TeamConfig,
  ParsedTranscriptLine,
  GitStatus,
} from './parsers';
