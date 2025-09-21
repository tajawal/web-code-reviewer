// Import actual modules for testing
const { LANGUAGE_ROLE_CONFIGS } = require('../src/config/languages');
const { buildLanguagePrompt, getReviewPrompt, LANGUAGE_PROMPTS } = require('../src/prompts/builder');

// Test the prompts structure and functionality
describe('Prompts Module Tests', () => {

  describe('Language Configuration', () => {
    it('should have language configurations for all supported languages', () => {
      const supportedLanguages = Object.keys(LANGUAGE_ROLE_CONFIGS);

      expect(supportedLanguages.length).toBeGreaterThan(0);

      supportedLanguages.forEach(lang => {
        const config = LANGUAGE_ROLE_CONFIGS[lang];
        expect(config).toBeDefined();
        expect(config.role).toBeDefined();
        expect(config.language).toBeDefined();
        expect(config.testExample).toBeDefined();
        expect(config.fileExample).toBeDefined();
      });
    });

    it('should have all required language configurations', () => {
      const expectedLanguages = ['js', 'python', 'java', 'php', 'swift', 'qa_web', 'qa_android', 'qa_backend'];

      expectedLanguages.forEach(lang => {
        expect(LANGUAGE_ROLE_CONFIGS[lang]).toBeDefined();
      });
    });
  });

  describe('Prompt Generation', () => {
    it('should generate prompts for all supported languages', () => {
      const supportedLanguages = Object.keys(LANGUAGE_ROLE_CONFIGS);

      supportedLanguages.forEach(lang => {
        expect(() => {
          const prompt = buildLanguagePrompt(lang);

          expect(typeof prompt).toBe('string');
          expect(prompt.length).toBeGreaterThan(0);
          expect(prompt).toContain(LANGUAGE_ROLE_CONFIGS[lang].role);
          expect(prompt).toContain(LANGUAGE_ROLE_CONFIGS[lang].language);
          expect(prompt).toContain(LANGUAGE_ROLE_CONFIGS[lang].testExample);
          expect(prompt).toContain(LANGUAGE_ROLE_CONFIGS[lang].fileExample);

          console.log(`✅ Generated prompt for ${lang} (${prompt.length} characters)`);
        }).not.toThrow();
      });
    });

    it('should include all required prompt components', () => {
      const testLang = 'js';
      const prompt = buildLanguagePrompt(testLang);

      // Check for key components that actually exist in the prompt
      expect(prompt).toContain('Role & Goal');
      expect(prompt).toContain('Determinism & Output Contract');
      expect(prompt).toContain('Severity Scoring');
      expect(prompt).toContain('Evidence & Remediation Requirements');
      expect(prompt).toContain('Output Format');
      expect(prompt).toContain('Context: Here are the code changes');
    });

    it('should handle unsupported languages gracefully', () => {
      expect(() => {
        buildLanguagePrompt('unsupported_lang');
      }).toThrow('Unsupported language: unsupported_lang');
    });
  });

  describe('Language Prompts Object', () => {
    it('should have prompts for all supported languages', () => {
      const supportedLanguages = Object.keys(LANGUAGE_ROLE_CONFIGS);

      supportedLanguages.forEach(lang => {
        expect(LANGUAGE_PROMPTS[lang]).toBeDefined();
        expect(typeof LANGUAGE_PROMPTS[lang]).toBe('string');
        expect(LANGUAGE_PROMPTS[lang].length).toBeGreaterThan(0);
      });
    });

    it('should have consistent prompt structure across languages', () => {
      const testLanguages = ['js', 'python', 'qa_web'];

      testLanguages.forEach(lang => {
        const prompt = LANGUAGE_PROMPTS[lang];

        // All prompts should have similar structure
        expect(prompt).toContain('Role & Goal');
        expect(prompt).toContain('Determinism & Output Contract');
        expect(prompt).toContain('Severity Scoring');
        expect(prompt).toContain('Evidence & Remediation Requirements');
        expect(prompt).toContain('Output Format');
      });
    });
  });

  describe('Get Review Prompt Function', () => {
    it('should return correct prompt for supported languages', () => {
      const supportedLanguages = Object.keys(LANGUAGE_ROLE_CONFIGS);

      supportedLanguages.forEach(lang => {
        const prompt = getReviewPrompt(lang);

        expect(prompt).toBe(LANGUAGE_PROMPTS[lang]);
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
      });
    });

    it('should fallback to JS prompt for unsupported languages', () => {
      const fallbackPrompt = getReviewPrompt('unsupported_lang');
      const jsPrompt = LANGUAGE_PROMPTS.js;

      expect(fallbackPrompt).toBe(jsPrompt);
    });

    it('should handle null and undefined languages', () => {
      const nullPrompt = getReviewPrompt(null);
      const undefinedPrompt = getReviewPrompt(undefined);
      const jsPrompt = LANGUAGE_PROMPTS.js;

      expect(nullPrompt).toBe(jsPrompt);
      expect(undefinedPrompt).toBe(jsPrompt);
    });
  });

  describe('Prompt Content Validation', () => {
    it('should include language-specific security rules', () => {
      const jsPrompt = buildLanguagePrompt('js');
      const pythonPrompt = buildLanguagePrompt('python');
      const swiftPrompt = buildLanguagePrompt('swift');
      const qaWebPrompt = buildLanguagePrompt('qa_web');

      // JavaScript specific checks
      expect(jsPrompt).toContain('JavaScript');
      expect(jsPrompt).toContain('frontend engineer');

      // Python specific checks
      expect(pythonPrompt).toContain('Python');
      expect(pythonPrompt).toContain('Python engineer');

      // QA Web specific checks
      expect(qaWebPrompt).toContain('Web QA');
      expect(qaWebPrompt).toContain('Automation Engineer');

      // Swift specific checks
      expect(swiftPrompt).toContain('Swift');
      expect(swiftPrompt).toContain('UIKit');
      expect(swiftPrompt).toContain('iOS engineer');
    });

    it('should include appropriate test examples for each language', () => {
      const jsPrompt = buildLanguagePrompt('js');
      const pythonPrompt = buildLanguagePrompt('python');
      const swiftPrompt = buildLanguagePrompt('swift');
      const qaWebPrompt = buildLanguagePrompt('qa_web');

      expect(jsPrompt).toContain('RTL/jest/vitest');
      expect(pythonPrompt).toContain('pytest');
      expect(swiftPrompt).toContain('XCTest');
      expect(qaWebPrompt).toContain('cypress');
    });

    it('should include appropriate file examples for each language', () => {
      const jsPrompt = buildLanguagePrompt('js');
      const pythonPrompt = buildLanguagePrompt('python');
      const swiftPrompt = buildLanguagePrompt('swift');
      const qaWebPrompt = buildLanguagePrompt('qa_web');

      expect(jsPrompt).toContain('Table.tsx');
      expect(pythonPrompt).toContain('user_service.py');
      expect(swiftPrompt).toContain('HomeView.swift');
      expect(qaWebPrompt).toContain('activatesHomePage.spec.js');
    });
  });
});
