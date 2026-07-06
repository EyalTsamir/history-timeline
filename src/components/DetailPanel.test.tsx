import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DetailPanel } from './DetailPanel';
import { makeFixtureDataset, makeTimelineItem } from '../test/fixtures';

// vitest globals are off, so RTL cannot auto-register its cleanup.
afterEach(cleanup);

const dataset = makeFixtureDataset();
const typeLabels = new Map([['event', 'אירוע']]);

function renderPanel(overrides: Partial<ReturnType<typeof makeTimelineItem>['detail']> = {}) {
  const item = makeTimelineItem('fx-media', 1948, null, {
    detail: { description: 'תיאור', displayDate: '1948', sources: [], ...overrides },
  });
  render(
    <DetailPanel
      item={item}
      dataset={dataset}
      typeLabels={typeLabels}
      itemById={new Map()}
      onSelectRelated={vi.fn()}
    />,
  );
}

describe('DetailPanel media', () => {
  it('renders the image with its credit when present', () => {
    renderPanel({ image: { src: 'https://upload.wikimedia.org/example.jpg', alt: { he: 'תיאור תמונה' }, credit: 'ויקישיתוף' } });
    const img = screen.getByAltText('תיאור תמונה');
    expect(img).toHaveAttribute('src', 'https://upload.wikimedia.org/example.jpg');
    expect(screen.getByText('ויקישיתוף')).toBeInTheDocument();
  });

  it('renders a youtube-nocookie iframe embed for a video', () => {
    renderPanel({ video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: { he: 'כותרת הסרטון' }, credit: 'יוטיוב' } });
    const iframe = screen.getByTitle('כותרת הסרטון');
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(screen.getByText('יוטיוב')).toBeInTheDocument();
  });

  it('renders neither image nor video when absent', () => {
    renderPanel();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
  });
});
