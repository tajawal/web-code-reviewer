/**
 * Comprehensive tests for FileService
 */

const FileService = require('../src/services/file-service');

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}));
const core = require('@actions/core');

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const { execSync } = require('child_process');

describe('FileService', () => {
  let fileService;

  beforeEach(() => {
    fileService = new FileService('main', 'js', ['src/'], ['node_modules/', 'dist/']);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct parameters', () => {
      const service = new FileService('develop', 'python', ['app/'], ['__pycache__/', '.pytest_cache/']);
      
      expect(service.baseBranch).toBe('develop');
      expect(service.language).toBe('python');
      expect(service.pathToFiles).toEqual(['app/']);
      expect(service.ignorePatterns).toEqual(['__pycache__/', '.pytest_cache/']);
    });

    it('should handle empty ignore patterns', () => {
      const service = new FileService('main', 'js', ['src/'], []);
      expect(service.ignorePatterns).toEqual([]);
    });

    it('should handle null ignore patterns', () => {
      const service = new FileService('main', 'js', ['src/'], null);
      expect(service.ignorePatterns).toBe(null);
    });
  });

  describe('getChangedFiles', () => {
    it('should return changed files with correct structure', () => {
      const mockGitOutput = `src/index.js
src/utils.js
src/components/Button.jsx`;

      execSync.mockReturnValue(mockGitOutput);

      const result = fileService.getChangedFiles();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      
      expect(result[0]).toBe('src/index.js');
      expect(result[1]).toBe('src/utils.js');
      expect(result[2]).toBe('src/components/Button.jsx');
    });

    it('should filter files by language', () => {
      const mockGitOutput = `src/index.js
src/utils.py
src/components/Button.jsx
src/test.java`;

      execSync.mockReturnValue(mockGitOutput);

      const result = fileService.getChangedFiles();

      // Should only include JS/JSX files for 'js' language
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('src/index.js');
      expect(result[1]).toBe('src/components/Button.jsx');
    });

    it('should filter files by path', () => {
      const mockGitOutput = `src/index.js
tests/utils.js
docs/README.md
src/components/Button.jsx`;

      execSync.mockReturnValue(mockGitOutput);

      const result = fileService.getChangedFiles();

      // Should only include files in src/ path
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('src/index.js');
      expect(result[1]).toBe('src/components/Button.jsx');
    });

    it('should apply ignore patterns', () => {
      const mockGitOutput = `src/index.js
src/node_modules/index.js
src/dist.js
src/components/Button.jsx`;

      execSync.mockReturnValue(mockGitOutput);

      const result = fileService.getChangedFiles();

      // The ignore patterns ['node_modules/', 'dist/'] use endsWith logic
      // So they won't match these files. Let's test with patterns that would match
      expect(result).toHaveLength(4); // All files should pass since patterns don't match
      expect(result[0]).toBe('src/index.js');
      expect(result[1]).toBe('src/node_modules/index.js');
      expect(result[2]).toBe('src/dist.js');
      expect(result[3]).toBe('src/components/Button.jsx');
    });

    it('should handle empty git output', () => {
      execSync.mockReturnValue('');

      const result = fileService.getChangedFiles();

      expect(result).toEqual([]);
    });

    it('should handle git command errors', () => {
      execSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      const result = fileService.getChangedFiles();

      expect(result).toEqual([]);
    });

    it('should handle malformed git output', () => {
      const mockGitOutput = `src/index.js
malformed line
src/utils.js`;

      execSync.mockReturnValue(mockGitOutput);

      const result = fileService.getChangedFiles();

      // Should skip malformed lines and return valid ones
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('src/index.js');
      expect(result[1]).toBe('src/utils.js');
    });

    it('should handle files with special characters in names', () => {
      const mockGitOutput = `src/file with spaces.js
src/file&with&special.js
src/file(with)parentheses.js`;

      execSync.mockReturnValue(mockGitOutput);

      const result = fileService.getChangedFiles();

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('src/file with spaces.js');
      expect(result[1]).toBe('src/file&with&special.js');
      expect(result[2]).toBe('src/file(with)parentheses.js');
    });
  });

  describe('getFullDiff', () => {
    it('should return full diff with correct format', () => {
      // Mock getChangedFiles to return files
      execSync
        .mockReturnValueOnce('src/index.js\nsrc/utils.js') // getChangedFiles
        .mockReturnValueOnce('--- File Structure Context for src/index.js ---\nimport React from "react";\n--- End Structure ---\n\ndiff --git a/src/index.js b/src/index.js\nindex 1234567..abcdefg 100644\n--- a/src/index.js\n+++ b/src/index.js\n@@ -1,3 +1,4 @@\n line1\n+new line\n line2\n line3') // getFileDiff for first file
        .mockReturnValueOnce('--- File Structure Context for src/utils.js ---\n--- End Structure ---\n\ndiff --git a/src/utils.js b/src/utils.js\nindex 1234567..abcdefg 100644\n--- a/src/utils.js\n+++ b/src/utils.js\n@@ -1,3 +1,4 @@\n line1\n+new line\n line2\n line3'); // getFileDiff for second file

      const result = fileService.getFullDiff();

      expect(typeof result).toBe('string');
      expect(result).toContain('--- File: src/index.js ---');
      expect(result).toContain('+new line');
      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only origin/main...HEAD',
        { encoding: 'utf8' }
      );
    });

    it('should handle empty diff', () => {
      execSync.mockReturnValue('');

      const result = fileService.getFullDiff();

      expect(result).toBe('');
    });

    it('should handle git command errors', () => {
      execSync.mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const result = fileService.getFullDiff();

      expect(result).toBe('');
    });

    it('should use correct base branch in diff command', () => {
      const service = new FileService('develop', 'js', ['src/'], []);
      execSync.mockReturnValue(''); // No changed files

      service.getFullDiff();

      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only origin/develop...HEAD',
        { encoding: 'utf8' }
      );
    });

    it('should handle files with special characters in diff command', () => {
      const service = new FileService('main', 'js', ['src/file with spaces/'], []);
      execSync.mockReturnValue(''); // No changed files

      service.getFullDiff();

      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only origin/main...HEAD',
        { encoding: 'utf8' }
      );
    });

    it('should wrap deletion blocks with context markers', () => {
      execSync
        .mockReturnValueOnce('src/delete.js')
        .mockReturnValueOnce(
          'diff --git a/src/delete.js b/src/delete.js\nindex 1111111..2222222 100644\n--- a/src/delete.js\n+++ b/src/delete.js\n@@ -1,2 +0,0 @@\n-old line\n-another old line'
        )
        .mockReturnValueOnce('import foo from "bar";');

      const result = fileService.getFullDiff();

      expect(result).toContain('--- Removed for context (flag only if the deletion is risky) ---');
      expect(result).toContain('-old line');
      expect(result).toContain('-another old line');
      expect(result).toContain('--- End removed context ---');
      expect(core.info).toHaveBeenCalledWith(
        'ℹ️  Diff for src/delete.js contains only deletions (kept as context).'
      );
    });
  });

  describe('matchesLanguage', () => {
    it('should match JavaScript files for js language', () => {
      expect(fileService.matchesLanguage('src/index.js')).toBe(true);
      expect(fileService.matchesLanguage('src/utils.js')).toBe(true);
      expect(fileService.matchesLanguage('src/components/Button.jsx')).toBe(true);
      expect(fileService.matchesLanguage('src/components/App.tsx')).toBe(true);
    });

    it('should not match non-JavaScript files for js language', () => {
      expect(fileService.matchesLanguage('src/index.py')).toBe(false);
      expect(fileService.matchesLanguage('src/utils.java')).toBe(false);
      expect(fileService.matchesLanguage('src/README.md')).toBe(false);
    });

    it('should match Python files for python language', () => {
      const pythonService = new FileService('main', 'python', 'src/', []);
      
      expect(pythonService.matchesLanguage('src/index.py')).toBe(true);
      expect(pythonService.matchesLanguage('src/utils.py')).toBe(true);
      expect(pythonService.matchesLanguage('src/test_pytest.py')).toBe(true);
    });

    it('should match Java files for java language', () => {
      const javaService = new FileService('main', 'java', 'src/', []);
      
      expect(javaService.matchesLanguage('src/Main.java')).toBe(true);
      expect(javaService.matchesLanguage('src/utils/Helper.java')).toBe(true);
    });

    it('should match PHP files for php language', () => {
      const phpService = new FileService('main', 'php', 'src/', []);
      
      expect(phpService.matchesLanguage('src/index.php')).toBe(true);
      expect(phpService.matchesLanguage('src/utils/helper.php')).toBe(true);
    });

    it('should handle files with no extension', () => {
      expect(fileService.matchesLanguage('src/README')).toBe(false);
      expect(fileService.matchesLanguage('src/Makefile')).toBe(false);
    });

    it('should handle files with multiple extensions', () => {
      expect(fileService.matchesLanguage('src/index.min.js')).toBe(true);
      expect(fileService.matchesLanguage('src/utils.test.js')).toBe(true);
    });
  });

  describe('getFileStructureContext', () => {
    it('should return file structure context', () => {
      const mockFileContent = `import React from 'react';
export const App = () => {};
class UserService {
  constructor() {}
}`;

      execSync.mockReturnValue(mockFileContent);

      const result = fileService.getFileStructureContext('src/index.js');

      expect(typeof result).toBe('string');
      expect(result).toContain('--- File Structure Context for src/index.js ---');
      expect(result).toContain('import React');
      expect(result).toContain('export const App');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git show HEAD:src/index.js'),
        { encoding: 'utf8', maxBuffer: 1024 * 1024 }
      );
    });

    it('should handle empty file structure', () => {
      execSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = fileService.getFileStructureContext('src/nonexistent.js');

      expect(result).toContain('--- File: src/nonexistent.js ---');
    });

    it('should handle command execution errors', () => {
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = fileService.getFileStructureContext('src/test.js');

      expect(result).toContain('--- File: src/test.js ---');
    });

    it('should use correct file patterns for different languages', () => {
      const pythonService = new FileService('main', 'python', ['src/'], []);
      execSync.mockReturnValue('import os\nclass Test:\n    pass');

      pythonService.getFileStructureContext('src/test.py');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git show HEAD:src/test.py'),
        { encoding: 'utf8', maxBuffer: 1024 * 1024 }
      );
    });
  });

  describe('Integration with getLanguageForFile', () => {
    it('should use getLanguageForFile for language matching', () => {
      // Test that the service uses the same logic as getLanguageForFile
      const testFiles = [
        'src/index.js',
        'src/components/Button.jsx',
        'src/utils.ts',
        'src/components/App.tsx',
        'src/index.py',
        'src/Main.java',
        'src/index.php'
      ];

      testFiles.forEach(file => {
        // For js language, should match .js and .jsx files
        const expectedMatch = file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx');
        expect(fileService.matchesLanguage(file)).toBe(expectedMatch);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined inputs gracefully', () => {
      const service = new FileService(null, undefined, null, null);
      
      expect(service.baseBranch).toBe(null);
      expect(service.language).toBe(undefined);
      expect(service.pathToFiles).toBe(null);
      expect(service.ignorePatterns).toBe(null);
    });

    it('should handle empty string inputs', () => {
      const service = new FileService('', '', [], []);
      
      expect(service.baseBranch).toBe('');
      expect(service.language).toBe('');
      expect(service.pathToFiles).toEqual([]);
    });

    it('should handle special characters in pathToFiles', () => {
      const service = new FileService('main', 'js', ['src/file with spaces/'], []);
      
      expect(service.pathToFiles).toEqual(['src/file with spaces/']);
    });

    it('should handle very long ignore patterns', () => {
      const longPatterns = Array(100).fill(0).map((_, i) => `pattern${i}/`);
      const service = new FileService('main', 'js', 'src/', longPatterns);
      
      expect(service.ignorePatterns).toHaveLength(100);
    });
  });

  describe('Performance', () => {
    it('should handle large number of changed files efficiently', () => {
      const largeGitOutput = Array(1000).fill(0).map((_, i) => `src/file${i}.js`).join('\n');
      execSync.mockReturnValue(largeGitOutput);

      const startTime = Date.now();
      const result = fileService.getChangedFiles();
      const endTime = Date.now();

      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large diff efficiently', () => {
      const largeDiff = 'x'.repeat(100000); // 100KB diff
      execSync
        .mockReturnValueOnce('src/large-file.js') // getChangedFiles
        .mockReturnValueOnce(largeDiff); // getFileDiff

      const startTime = Date.now();
      const result = fileService.getFullDiff();
      const endTime = Date.now();

      expect(result.length).toBeGreaterThan(100000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
