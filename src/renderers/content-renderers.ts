/**
 * Content-aware renderers for bifurcated collections (React/shadcn).
 *
 * Cell: download link or image thumbnail
 * Form: file upload input with accept/maxSize
 */

import React from 'react';
import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import type { CellProps, FormFieldProps } from '../types.js';

/** Check if a value is a ContentRef (matches @zodal/core isContentRef). */
function isContentRef(value: unknown): value is { _tag: 'ContentRef'; field: string; itemId: string; url?: string; mimeType?: string; size?: number } {
  return typeof value === 'object' && value !== null && '_tag' in value && (value as any)._tag === 'ContentRef';
}

// ============================================================================
// Cell Renderer: Content download/preview
// ============================================================================

function ContentCell({ value, config }: CellProps) {
  if (isContentRef(value)) {
    const ref = value;

    // Image preview
    if (ref.mimeType?.startsWith('image/') && ref.url) {
      return React.createElement('a', {
        href: ref.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'inline-block',
      },
        React.createElement('img', {
          src: ref.url,
          alt: ref.field,
          className: 'h-8 w-16 object-cover rounded',
        }),
      );
    }

    // Download link
    if (ref.url) {
      const sizeStr = ref.size ? ` (${formatSize(ref.size)})` : '';
      return React.createElement('a', {
        href: ref.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        download: ref.field,
        className: 'text-sm text-blue-600 hover:underline',
      }, `\u2913 Download${sizeStr}`);
    }

    // No URL
    return React.createElement('span', {
      className: 'text-sm text-muted-foreground',
    }, `[${ref.field}]`);
  }

  return React.createElement('span', {
    className: 'text-muted-foreground',
  }, String(value ?? '\u2014'));
}

// ============================================================================
// Form Renderer: File upload
// ============================================================================

function FileUploadInput({ field, config }: FormFieldProps) {
  const handleChange = (e: any) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const maxSize = (config as any).maxSize;
      if (maxSize && file.size > maxSize) {
        alert(`File too large. Max: ${formatSize(maxSize)}, got: ${formatSize(file.size)}`);
        e.target.value = '';
        return;
      }
      field.onChange(file);
    }
  };

  const children: React.ReactNode[] = [
    React.createElement('label', {
      htmlFor: config.name,
      className: 'text-sm font-medium',
      key: 'label',
    }, config.label),
    React.createElement('input', {
      id: config.name,
      type: 'file',
      accept: (config as any).acceptMimeTypes?.join(',') ?? undefined,
      required: config.required,
      disabled: config.disabled,
      onChange: handleChange,
      className: 'block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20',
      key: 'input',
    }),
  ];

  if (config.helpText) {
    children.push(
      React.createElement('p', {
        className: 'text-sm text-muted-foreground',
        key: 'help',
      }, config.helpText),
    );
  }

  if ((config as any).maxSize) {
    children.push(
      React.createElement('p', {
        className: 'text-xs text-muted-foreground',
        key: 'max-size',
      }, `Max size: ${formatSize((config as any).maxSize)}`),
    );
  }

  // Show current content reference
  if (isContentRef(field.value)) {
    const ref = field.value;
    children.push(
      React.createElement('p', {
        className: 'text-xs text-muted-foreground',
        key: 'current',
      },
        ref.url
          ? React.createElement('a', {
              href: ref.url,
              target: '_blank',
              className: 'text-blue-600 hover:underline',
            }, `Current: ${ref.field}${ref.size ? ` (${formatSize(ref.size)})` : ''}`)
          : `Current: ${ref.field}`,
      ),
    );
  }

  return React.createElement('div', { className: 'space-y-2' }, ...children);
}

// ============================================================================
// Helpers
// ============================================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ============================================================================
// Exports
// ============================================================================

/** Cell renderers for content fields (download link, image preview). */
export const contentCellRenderers: RendererEntry<React.ComponentType<CellProps>>[] = [
  {
    tester: (field, ctx) =>
      ctx.mode === 'cell' && (field as any).storageRole === 'content' ? PRIORITY.LIBRARY : -1,
    renderer: ContentCell,
    name: 'ContentCell',
  },
];

/** Form renderers for content fields (file upload). */
export const contentFormRenderers: RendererEntry<React.ComponentType<FormFieldProps>>[] = [
  {
    tester: (field, ctx) =>
      ctx.mode === 'form' && (field as any).storageRole === 'content' ? PRIORITY.LIBRARY : -1,
    renderer: FileUploadInput,
    name: 'FileUploadInput',
  },
];
