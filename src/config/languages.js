/**
 * Language-specific configurations
 */

const LANGUAGE_FILE_CONFIGS = {
  js: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
    patterns: ['*.js', '*.jsx', '*.ts', '*.tsx', '*.mjs'],
    name: 'JavaScript/TypeScript'
  },
  python: {
    extensions: ['.py', '.pyw', '.pyx', '.pyi'],
    patterns: ['*.py', '.pyw', '.pyx', '.pyi'],
    name: 'Python'
  },
  java: {
    extensions: ['.java'],
    patterns: ['*.java'],
    name: 'Java'
  },
  php: {
    extensions: ['.php'],
    patterns: ['*.php'],
    name: 'PHP'
  },
  swift: {
    extensions: ['.swift'],
    patterns: ['*.swift'],
    name: 'Swift (SwiftUI/UIKit)'
  },
  qa_web: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
    patterns: ['*.js', '*.jsx', '*.ts', '*.tsx', '*.mjs'],
    name: 'JavaScript/TypeScript'
  },
  qa_android: {
    extensions: ['.java'],
    patterns: ['*.java'],
    name: 'Java'
  },
  qa_backend: {
    extensions: ['.java'],
    patterns: ['*.java'],
    name: 'Java'
  }
};

const LANGUAGE_ROLE_CONFIGS = {
  js: {
    role: 'frontend engineer',
    language: 'JavaScript/TypeScript',
    testExample: ' (e.g., RTL/jest/vitest).',
    fileExample: 'src/components/Table.tsx'
  },
  python: {
    role: 'Python engineer',
    language: 'Python',
    testExample: ' (e.g., pytest)',
    fileExample: 'app/services/user_service.py'
  },
  java: {
    role: 'Java engineer',
    language: 'Java',
    testExample: ' (e.g., JUnit + MockMvc)',
    fileExample: 'src/main/java/com/example/user/UserService.java'
  },
  php: {
    role: 'PHP engineer',
    language: 'PHP',
    testExample: ' (e.g., Pest/PHPUnit feature test)',
    fileExample: 'app/Http/Controllers/UserController.php'
  },
  swift: {
    role: 'iOS engineer',
    language: 'Swift',
    testExample: ' (e.g., XCTest/XCUITest, snapshot tests)',
    fileExample: 'Sources/App/Features/Home/HomeView.swift'
  },
  qa_web: {
    role: 'Web QA - Automation Engineer',
    language: 'JavaScript',
    testExample: '(automation framework & tools: cypress )',
    fileExample: 'cypress/e2e/desktop/features/martech/home/activatesHomePage.spec.js'
  },
  qa_android: {
    role: 'Android QA - Automation Engineer',
    language: 'Java',
    testExample: '(automation framework & tools: appium, junit)',
    fileExample:
      'src/test/java/com/travel/tests/flights/searchResults/FlightPriceCalendarRGTest.java'
  },
  qa_backend: {
    role: 'Backend QA - Automation Engineer',
    language: 'Java',
    testExample: '(automation framework & tools: RestAssured, junit)',
    fileExample: 'src/main/java/com/example/user/UserService.java'
  }
};

const LANGUAGE_DEPENDENCY_CONFIGS = {
  js: [
    { file: 'package.json', label: 'package.json', parser: 'nodePackage' },
    { file: 'package-lock.json', label: 'package-lock.json', maxLines: 40 },
    { file: 'yarn.lock', label: 'yarn.lock', maxLines: 40 },
    { file: 'pnpm-lock.yaml', label: 'pnpm-lock.yaml', maxLines: 40 }
  ],
  python: [
    { file: 'pyproject.toml', label: 'pyproject.toml', maxLines: 60 },
    { file: 'requirements.txt', label: 'requirements.txt', maxLines: 60 },
    { file: 'Pipfile', label: 'Pipfile', maxLines: 60 },
    { file: 'Pipfile.lock', label: 'Pipfile.lock', maxLines: 40 },
    { file: 'poetry.lock', label: 'poetry.lock', maxLines: 40 }
  ],
  java: [
    { file: 'pom.xml', label: 'pom.xml', maxLines: 80 },
    { file: 'build.gradle', label: 'build.gradle', maxLines: 80 },
    { file: 'build.gradle.kts', label: 'build.gradle.kts', maxLines: 80 },
    { file: 'settings.gradle', label: 'settings.gradle', maxLines: 60 },
    { file: 'gradle.properties', label: 'gradle.properties', maxLines: 40 }
  ],
  php: [
    { file: 'composer.json', label: 'composer.json', parser: 'composerPackage' },
    { file: 'composer.lock', label: 'composer.lock', maxLines: 40 }
  ],
  swift: [
    { file: 'Package.swift', label: 'Package.swift', maxLines: 80 },
    { file: 'Package.resolved', label: 'Package.resolved', maxLines: 40 },
    { file: 'Podfile', label: 'Podfile', maxLines: 60 },
    { file: 'Cartfile', label: 'Cartfile', maxLines: 60 }
  ]
};

module.exports = {
  LANGUAGE_FILE_CONFIGS,
  LANGUAGE_ROLE_CONFIGS,
  LANGUAGE_DEPENDENCY_CONFIGS
};
