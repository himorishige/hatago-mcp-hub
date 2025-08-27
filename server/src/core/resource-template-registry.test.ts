/**
 * Resource Template Registry Tests
 */

import type { ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceTemplateRegistry } from './resource-template-registry.js';

describe('ResourceTemplateRegistry', () => {
  let registry: ResourceTemplateRegistry;

  beforeEach(() => {
    registry = new ResourceTemplateRegistry();
  });

  describe('registerTemplates', () => {
    it('should register templates from a server', () => {
      const templates: ResourceTemplate[] = [
        {
          uriTemplate: 'file:///{path}',
          name: 'file_template',
          description: 'Access files',
        },
        {
          uriTemplate: 'http://api.example.com/{endpoint}',
          name: 'api_template',
          description: 'Access API endpoints',
        },
      ];

      registry.registerTemplates('server1', templates);

      expect(registry.getTemplateCount()).toBe(2);
      expect(registry.getAllTemplates()).toHaveLength(2);
    });

    it('should format template names with server prefix', () => {
      const registry = new ResourceTemplateRegistry({
        strategy: 'alias', // alias strategy prepends server ID
        separator: '__',
        format: '{server}{separator}{tool}',
      });

      const templates: ResourceTemplate[] = [
        {
          uriTemplate: 'file:///{path}',
          name: 'file_template',
          description: 'Access files',
        },
      ];

      registry.registerTemplates('server1', templates);

      const allTemplates = registry.getAllTemplates();
      expect(allTemplates[0].name).toBe('server1__file_template');
    });

    it('should clear existing templates when re-registering for same server', () => {
      const templates1: ResourceTemplate[] = [
        {
          uriTemplate: 'file:///{path}',
          name: 'template1',
        },
      ];

      const templates2: ResourceTemplate[] = [
        {
          uriTemplate: 'http://api/{endpoint}',
          name: 'template2',
        },
        {
          uriTemplate: 'db:///{table}',
          name: 'template3',
        },
      ];

      registry.registerTemplates('server1', templates1);
      expect(registry.getTemplateCount()).toBe(1);

      registry.registerTemplates('server1', templates2);
      expect(registry.getTemplateCount()).toBe(2);
      expect(registry.getAllTemplates()).toHaveLength(2);
    });
  });

  describe('getServerTemplates', () => {
    it('should return templates for a specific server', () => {
      const templatesServer1: ResourceTemplate[] = [
        { uriTemplate: 'file:///{path}', name: 'file_template' },
      ];

      const templatesServer2: ResourceTemplate[] = [
        { uriTemplate: 'http://api/{endpoint}', name: 'api_template' },
        { uriTemplate: 'db:///{table}', name: 'db_template' },
      ];

      registry.registerTemplates('server1', templatesServer1);
      registry.registerTemplates('server2', templatesServer2);

      const server1Templates = registry.getServerTemplates('server1');
      const server2Templates = registry.getServerTemplates('server2');

      expect(server1Templates).toHaveLength(1);
      expect(server2Templates).toHaveLength(2);
    });

    it('should return empty array for unknown server', () => {
      const templates = registry.getServerTemplates('unknown');
      expect(templates).toEqual([]);
    });
  });

  describe('getTemplate', () => {
    it('should return template metadata by name', () => {
      const templates: ResourceTemplate[] = [
        {
          uriTemplate: 'file:///{path}',
          name: 'file_template',
          description: 'File access',
        },
      ];

      registry.registerTemplates('server1', templates);

      // Template is stored with formatted name (namespace strategy: file_template_server1)
      const metadata = registry.getTemplate('file_template_server1');
      expect(metadata).toBeDefined();
      expect(metadata?.serverId).toBe('server1');
      expect(metadata?.originalName).toBe('file_template');
      expect(metadata?.template.description).toBe('File access');
    });

    it('should return undefined for unknown template', () => {
      const metadata = registry.getTemplate('unknown');
      expect(metadata).toBeUndefined();
    });
  });

  describe('clearServerTemplates', () => {
    it('should clear all templates for a specific server', () => {
      const templatesServer1: ResourceTemplate[] = [
        { uriTemplate: 'file:///{path}', name: 'template1' },
      ];

      const templatesServer2: ResourceTemplate[] = [
        { uriTemplate: 'http://api/{endpoint}', name: 'template2' },
      ];

      registry.registerTemplates('server1', templatesServer1);
      registry.registerTemplates('server2', templatesServer2);

      registry.clearServerTemplates('server1');

      expect(registry.getServerTemplates('server1')).toHaveLength(0);
      expect(registry.getServerTemplates('server2')).toHaveLength(1);
      expect(registry.getTemplateCount()).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all templates from all servers', () => {
      const templatesServer1: ResourceTemplate[] = [
        { uriTemplate: 'file:///{path}', name: 'template1' },
      ];

      const templatesServer2: ResourceTemplate[] = [
        { uriTemplate: 'http://api/{endpoint}', name: 'template2' },
      ];

      registry.registerTemplates('server1', templatesServer1);
      registry.registerTemplates('server2', templatesServer2);

      registry.clearAll();

      expect(registry.getTemplateCount()).toBe(0);
      expect(registry.getAllTemplates()).toHaveLength(0);
    });
  });

  describe('hasTemplate', () => {
    it('should return true if template exists', () => {
      const templates: ResourceTemplate[] = [
        { uriTemplate: 'file:///{path}', name: 'file_template' },
      ];

      registry.registerTemplates('server1', templates);

      // Template is stored with formatted name (namespace strategy: file_template_server1)
      expect(registry.hasTemplate('file_template_server1')).toBe(true);
      expect(registry.hasTemplate('unknown')).toBe(false);
    });
  });

  describe('template naming strategies', () => {
    it('should not format names with strategy error', () => {
      const registry = new ResourceTemplateRegistry({
        strategy: 'error', // 'error' strategy doesn't modify names
        separator: '_',
        format: '{server}{separator}{tool}',
      });

      const templates: ResourceTemplate[] = [
        { uriTemplate: 'file:///{path}', name: 'file_template' },
      ];

      registry.registerTemplates('server1', templates);

      const allTemplates = registry.getAllTemplates();
      expect(allTemplates[0].name).toBe('file_template');
    });

    it('should format names with custom separator', () => {
      const registry = new ResourceTemplateRegistry({
        strategy: 'alias', // alias strategy prepends server ID
        separator: '::',
        format: '{server}{separator}{tool}',
      });

      const templates: ResourceTemplate[] = [
        { uriTemplate: 'file:///{path}', name: 'file_template' },
      ];

      registry.registerTemplates('server1', templates);

      const allTemplates = registry.getAllTemplates();
      expect(allTemplates[0].name).toBe('server1::file_template');
    });
  });
});
