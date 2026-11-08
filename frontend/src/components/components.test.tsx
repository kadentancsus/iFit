import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { isActivePath } from '@/lib/navigation';

import { NavLinks, ProfileLink } from './navigation/nav-links';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { TextField } from './ui/text-field';

describe('navigation', () => {
  it('matches sections and their sub-pages, but home only exactly', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/routines', '/')).toBe(false);
    expect(isActivePath('/routines/abc', '/routines')).toBe(true);
    expect(isActivePath('/routinesx', '/routines')).toBe(false);
  });

  it('marks only the current section as the current page', () => {
    const html = renderToStaticMarkup(<NavLinks pathname="/history/123" />);
    expect(html).toContain('aria-label="Main"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const current = /<a [^>]*aria-current="page"[^>]*>/.exec(html)?.[0];
    expect(current).toContain('href="/history"');
  });

  it('marks the profile link when on the profile page', () => {
    expect(renderToStaticMarkup(<ProfileLink pathname="/profile" />)).toContain(
      'aria-current="page"',
    );
    expect(renderToStaticMarkup(<ProfileLink pathname="/" />)).not.toContain('aria-current');
  });
});

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain('type="button"');
  });

  it('is disabled and labeled while pending, blocking double submits', () => {
    const html = renderToStaticMarkup(
      <Button pending pendingLabel="Logging set…">
        Complete set
      </Button>,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Logging set…');
    expect(html).not.toContain('Complete set');
  });
});

describe('TextField', () => {
  it('links the label, hint and error to the input', () => {
    const html = renderToStaticMarkup(
      <TextField label="Weight" hint="Per dumbbell, in lb" error="Enter a weight." />,
    );
    const id = /<input[^>]*\sid="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-hint ${id}-error"`);
    expect(html).toContain('aria-invalid="true"');
  });

  it('is not marked invalid without an error', () => {
    const html = renderToStaticMarkup(<TextField label="Name" />);
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('aria-describedby');
  });
});

describe('Alert', () => {
  it('interrupts for errors and waits politely otherwise', () => {
    expect(renderToStaticMarkup(<Alert tone="danger">Not saved</Alert>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Alert tone="success">Saved</Alert>)).toContain('role="status"');
  });
});
