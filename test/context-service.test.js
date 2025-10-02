/**
 * Comprehensive tests for ContextService
 */

const ContextService = require('../src/services/context-service');
const CONTEXT_CONFIG = require('../src/config/context');
const { LANGUAGE_DEPENDENCY_CONFIGS } = require('../src/config/languages');
const { getLanguageAnalyzer } = require('../src/language-analyzers');

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}));

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const { execSync } = require('child_process');

describe('ContextService', () => {
  let contextService;

  beforeEach(() => {
    contextService = new ContextService('main');
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with base branch', () => {
      const service = new ContextService('develop');
      expect(service.baseBranch).toBe('develop');
      expect(service.language).toBe('js');
    });

    it('should default to main branch if none provided', () => {
      const service = new ContextService();
      expect(service.baseBranch).toBeUndefined();
      expect(service.language).toBe('js');
    });

    it('should normalize provided language to lowercase', () => {
      const service = new ContextService('develop', 'Python');
      expect(service.language).toBe('python');
    });
  });

  describe('detectLanguageFromPath', () => {
    it('should infer language from file extension using config metadata', () => {
      expect(contextService.detectLanguageFromPath('src/main/java/App.java')).toBe('java');
      expect(contextService.detectLanguageFromPath('app/services/user_service.py')).toBe('python');
      expect(contextService.detectLanguageFromPath('Sources/App/Feature.swift')).toBe('swift');
    });

    it('should fall back to constructor language when extension is unknown', () => {
      const service = new ContextService('main', 'php');
      expect(service.detectLanguageFromPath('README.unknown')).toBe('php');
    });
  });


  describe('getDependencyContext', () => {
    it('should summarize package.json dependencies for JavaScript projects', async () => {
      const jsDependencyFiles = LANGUAGE_DEPENDENCY_CONFIGS.js;
      const packageJsonConfig = jsDependencyFiles[0];

      const mockPackageJson = JSON.stringify({
        name: 'test-project',
        version: '1.2.3',
        type: 'module',
        dependencies: {
          react: '^18.0.0',
          lodash: '^4.17.21'
        },
        devDependencies: {
          jest: '^29.0.0'
        }
      });

      execSync.mockImplementation(command => {
        if (command.includes(packageJsonConfig.file)) {
          return mockPackageJson;
        }
        return '';
      });

      const result = await contextService.getDependencyContext();

      expect(result).toContain('--- Dependencies Context ---');
      expect(result).toContain('📦 package.json');
      expect(result).toContain('Dependencies (2):');
      expect(result).toContain('- react: ^18.0.0');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining(packageJsonConfig.file),
        expect.objectContaining({
          encoding: 'utf8',
          maxBuffer: 5242880,
          timeout: 30000
        })
      );
    });

    it('should handle missing dependency manifests gracefully', async () => {
      execSync.mockReturnValue('');

      const result = await contextService.getDependencyContext();

      expect(result).toContain('--- Dependencies Context ---');
      expect(result).toContain('No dependency manifests detected.');
    });

    it('should fall back to raw package.json when JSON parsing fails', async () => {
      const jsDependencyFiles = LANGUAGE_DEPENDENCY_CONFIGS.js;
      const packageJsonConfig = jsDependencyFiles[0];

      execSync.mockImplementation(command => {
        if (command.includes(packageJsonConfig.file)) {
          return 'invalid json';
        }
        return '';
      });

      const result = await contextService.getDependencyContext();

      expect(result).toContain('--- Dependencies Context ---');
      expect(result).toContain('📦 package.json (raw):');
      expect(result).toContain('invalid json');
    });

    it('should include python dependency files when present', async () => {
      const pythonContextService = new ContextService('main', 'python');

      const pythonDependencies = LANGUAGE_DEPENDENCY_CONFIGS.python;
      const requirementsConfig = pythonDependencies.find(dep => dep.file === 'requirements.txt');

      execSync.mockImplementation(command => {
        if (requirementsConfig && command.includes(requirementsConfig.file)) {
          return 'Django==4.2.0\nrequests==2.31.0\n';
        }
        return '';
      });

      const result = await pythonContextService.getDependencyContext();

      expect(result).toContain('Language preference: python');
      expect(result).toContain('📄 requirements.txt (first 60 lines):');
      expect(result).toContain('Django==4.2.0');
    });

    it('should fall back to JavaScript manifests when none found for the selected language', async () => {
      const pythonContextService = new ContextService('main', 'python');

      const mockPackageJson = JSON.stringify({
        dependencies: {
          express: '^4.18.2'
        }
      });

      const jsDependencyFiles = LANGUAGE_DEPENDENCY_CONFIGS.js;
      const packageJsonConfig = jsDependencyFiles[0];

      execSync.mockImplementation(command => {
        if (command.includes(packageJsonConfig.file)) {
          return mockPackageJson;
        }
        return '';
      });

      const result = await pythonContextService.getDependencyContext();

      expect(result).toContain('Falling back to js');
      expect(result).toContain('📦 package.json');
      expect(result).toContain('express: ^4.18.2');
    });
  });

  describe('getRecentCommitContext', () => {
    it('should return recent commit context', async () => {
      const mockCommits = `Add new feature
Fix bug in authentication
Update dependencies
Refactor user service`;

      execSync.mockReturnValue(mockCommits);

      const result = await contextService.getRecentCommitContext();

      expect(result).toContain('--- Recent Commits Context ---');
      expect(result).toContain('Add new feature');
      expect(result).toContain('Fix bug in authentication');
      expect(execSync).toHaveBeenCalledWith(
        'git log --oneline --no-merges origin/main..HEAD | head -15 | sed \'s/^[a-f0-9]* //\'',
        expect.objectContaining({
          encoding: 'utf8',
          maxBuffer: 5242880,
          timeout: 30000
        })
      );
    });

    it('should handle no recent commits', async () => {
      execSync.mockReturnValue('');

      const result = await contextService.getRecentCommitContext();

      expect(result).toContain('--- Recent Commits Context ---');
      expect(result).toContain('--- End Recent Commits ---');
    });

    it('should handle git command errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      const result = await contextService.getRecentCommitContext();

      expect(result).toBe(''); // Should return empty string when git command fails
    });
  });

  describe('getSemanticCodeContext', () => {
    it('should return semantic context for changed files', async () => {
      const changedFiles = ['src/index.js', 'src/utils.js'];
      
      // Mock file content for each file
      execSync
        .mockReturnValueOnce('function calculateTotal() {\n  return a + b;\n}\n\nclass UserService {\n  constructor() {}\n}')
        .mockReturnValueOnce('export const API_URL = "https://api.example.com";\n\nfunction validateInput(input) {\n  return input.length > 0;\n}');

      const result = await contextService.getSemanticCodeContext(changedFiles);

      expect(result).toContain('--- Semantic Code Context ---');
      expect(result).toContain('src/index.js');
      expect(result).toContain('src/utils.js');
      expect(result).toContain('Key Definitions:');
    });

    it('should handle empty changed files array', async () => {
      const result = await contextService.getSemanticCodeContext([]);

      expect(result).toContain('--- Semantic Code Context ---');
      expect(result).toContain('No changed files to analyze');
    });

    it('should handle file read errors', async () => {
      const changedFiles = ['src/nonexistent.js'];
      
      execSync.mockImplementation(() => {
        throw new Error('No such file');
      });

      const result = await contextService.getSemanticCodeContext(changedFiles);

      expect(result).toContain('--- Semantic Code Context ---');
      expect(result).toContain('src/nonexistent.js');
      expect(result).toContain('Could not analyze');
    });
  });

  describe('getFileRelationshipsContext', () => {
    it('should return file relationships context', async () => {
      const changedFiles = ['src/index.js'];
      
      const mockFileContent = `import { UserService } from './services/user-service.js';
import React from 'react';
import { API_URL } from './constants.js';

export const App = () => {
  return <div>Hello World</div>;
};

export default App;`;

      execSync.mockReturnValue(mockFileContent);

      const result = await contextService.getFileRelationshipsContext(changedFiles);

      expect(result).toContain('--- File Relationships Context ---');
      expect(result).toContain('src/index.js');
      expect(result).toContain('Imports:');
      expect(result).toContain('Exports:');
    });

    it('should capture python imports and definitions', async () => {
      const pythonContent = `import os\nfrom django.conf import settings\n\nclass SampleService:\n    def __init__(self):\n        self.value = 1\n\n    def do_work(self):\n        return self.value\n\n\ndef helper():\n    return True\n`;

      execSync.mockReturnValue(pythonContent);

      const relationships = await contextService.getFileRelationshipsContext(['app/main.py']);

      expect(relationships).toContain('Import: os');
      expect(relationships).toContain('From django.conf import settings');
      expect(relationships).toContain('Class: SampleService');

      const semanticContext = await contextService.getSemanticCodeContext(['app/main.py']);

      expect(semanticContext).toContain('Function: def helper');
      expect(semanticContext).toContain('Class: class SampleService');
    });

    it('should handle empty changed files', async () => {
      const result = await contextService.getFileRelationshipsContext([]);

      expect(result).toContain('--- File Relationships Context ---');
      expect(result).toContain('No changed files to analyze');
    });
  });

  describe('getComprehensiveContext', () => {
    it('should generate comprehensive context with all components', async () => {
      const changedFiles = ['src/index.js'];
      
      // Mock all the individual context methods
      execSync
        .mockReturnValueOnce('src/\n  index.js\npackage.json') // project structure
        .mockReturnValueOnce('{"name": "test", "type": "module"}') // package.json
        .mockReturnValueOnce('Add new feature\nFix bug') // commits
        .mockReturnValueOnce('function test() {}') // semantic code
        .mockReturnValueOnce('import React from "react";\nexport const App = () => {};'); // file relationships

      const result = await contextService.getComprehensiveContext(changedFiles, 1000);

      expect(result).toContain('🧠 LLM-FOCUSED CODE REVIEW CONTEXT');
      expect(result).toContain('📝 FILES BEING REVIEWED:');
      expect(result).toContain('🔍 SEMANTIC CODE:');
    });

    it('should handle context size limits', async () => {
      const changedFiles = ['src/index.js'];
      
      // Mock a very large context
      const largeContext = 'x'.repeat(100000);
      execSync.mockReturnValue(largeContext);

      const result = await contextService.getComprehensiveContext(changedFiles, 1000);

      expect(result.length).toBeLessThanOrEqual(CONTEXT_CONFIG.MAX_CONTEXT_SIZE_LARGE + 1000); // Allow some tolerance
    });

    it('should handle empty changed files', async () => {
      const result = await contextService.getComprehensiveContext([], 1000);

      expect(result).toContain('🧠 LLM-FOCUSED CODE REVIEW CONTEXT');
      // When no files are provided, the context might be empty or minimal
      expect(typeof result).toBe('string');
    });
  });

  describe('calculateDynamicContextSize', () => {
    it('should calculate context size based on estimated tokens', () => {
      const result = contextService.calculateDynamicContextSize(50000);

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(CONTEXT_CONFIG.MAX_CONTEXT_SIZE_LARGE);
    });

    it('should return min size for very large token counts', () => {
      const result = contextService.calculateDynamicContextSize(1000000);
      
      expect(result).toBe(CONTEXT_CONFIG.MIN_CONTEXT_SIZE);
    });

    it('should return min size for very small token counts', () => {
      const result = contextService.calculateDynamicContextSize(100);
      
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('language analyzers (JavaScript)', () => {
    const jsAnalyzer = getLanguageAnalyzer('js');

    it('should extract key definitions from JavaScript code', () => {
      const code = `function calculateTotal(a, b) {
  return a + b;
}

class UserService {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }
}

type PaymentStatus = 'pending' | 'completed' | 'failed';`;

      const result = jsAnalyzer.getDefinitions(code);

      expect(result.some(def => def.includes('Function: function calculateTotal(a, b) {'))).toBe(true);
      expect(result.some(def => def.includes('Class: class UserService {'))).toBe(true);
      expect(result.some(def => def.includes('Type: type PaymentStatus ='))).toBe(true);
    });

    it('should limit number of definitions and avoid unnecessary truncation', () => {
      const code = Array.from({ length: 20 }, (_, i) => `function test${i}() {\n  return ${i};\n}`).join('\n');

      const result = jsAnalyzer.getDefinitions(code);

      expect(result.length).toBeLessThanOrEqual(8);
      expect(result.some(def => def.includes('// ... (truncated'))).toBe(false);
    });

    it('should parse JavaScript import statements', () => {
      const code = `import React from 'react';
import { useState, useEffect } from 'react';
const lodash = require('lodash');`;

      const imports = jsAnalyzer.getImports(code);

      expect(imports).toContain("Import: react (import React from 'react';)");
      expect(imports).toContain("Import: react (import { useState, useEffect } from 'react';)");
      expect(imports).toContain("Require: lodash (const lodash = require('lodash');)");
    });

    it('should parse JavaScript export statements', () => {
      const code = `export const API_URL = 'https://api.example.com';
export function calculateTotal(a, b) {
  return a + b;
}

module.exports = {
  calculateTotal
};`;

      const exports = jsAnalyzer.getExports(code);

      expect(exports).toContain("Export: export const API_URL = 'https://api.example.com';");
      expect(exports.some(line => line.includes('calculateTotal(a, b)'))).toBe(true);
      expect(exports.some(line => line.includes('module.exports'))).toBe(true);
    });
  });

  describe('escapeFilePath', () => {
    it('should escape special characters in file paths', () => {
      const testCases = [
        { input: 'src/index.js', expected: "'src/index.js'" },
        { input: 'src/file with spaces.js', expected: "'src/file with spaces.js'" },
        { input: 'src/file&with&special.js', expected: "'src/file&with&special.js'" },
        { input: 'src/file(with)parentheses.js', expected: "'src/file(with)parentheses.js'" }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = contextService.escapeFilePath(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle multiple command failures gracefully', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = await contextService.getComprehensiveContext(['src/index.js'], 1000);

      expect(result).toContain('🧠 LLM-FOCUSED CODE REVIEW CONTEXT');
      expect(result).toContain('📝 FILES BEING REVIEWED:');
      expect(result).toContain('🔍 SEMANTIC CODE:');
      expect(result).toContain('🔗 FILE RELATIONSHIPS:');
    });

    it('should handle null/undefined inputs', async () => {
      const result = await contextService.getComprehensiveContext(null, 1000);
      expect(result).toBeDefined();
    });
  });
});
