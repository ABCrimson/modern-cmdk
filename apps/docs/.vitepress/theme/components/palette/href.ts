import { useData, withBase } from 'vitepress';

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;
const PATH_AND_SUFFIX = /^([^?#]*)(.*)$/;

/**
 * Returns the one helper that turns a palette href into a URL a browser can follow:
 * `withBase(path + (cleanUrls ? '' : '.html'))`. Absolute URLs pass through untouched.
 * `cleanUrls` is read from the site config (`useData().site`), so the no-JS <a href> points at a
 * real file whichever way config.ts sets it. A `?query` or `#hash` stays after the extension, and
 * a path that is the site root or ends in a slash gets no extension.
 */
export function usePageHref(): (path: string) => string {
  const { site } = useData();
  return (path: string): string => {
    if (ABSOLUTE_URL.test(path)) return path;
    const [, pathname = path, suffix = ''] = PATH_AND_SUFFIX.exec(path) ?? [];
    const extension = site.value.cleanUrls || pathname.endsWith('/') ? '' : '.html';
    return withBase(`${pathname}${extension}${suffix}`);
  };
}
