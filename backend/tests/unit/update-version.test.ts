import { isVersionNewer } from '../../src/api/routes/update.js';

describe('update version precedence', () => {
  it('does not treat an older stable release as an update for a newer Beta app', () => {
    expect(isVersionNewer('v1.9.9', '2.0.0-beta.14')).toBe(false);
  });

  it('ignores an optional v prefix when versions are otherwise equal', () => {
    expect(isVersionNewer('v2.0.0-beta.14', '2.0.0-beta.14')).toBe(false);
  });

  it('recognizes a later Beta sequence as newer', () => {
    expect(isVersionNewer('v2.0.0-beta.15', '2.0.0-beta.14')).toBe(true);
  });

  it('recognizes the stable release of the same core version as newer than Beta', () => {
    expect(isVersionNewer('v2.0.0', '2.0.0-beta.14')).toBe(true);
  });

  it('compares numeric prerelease identifiers numerically', () => {
    expect(isVersionNewer('2.0.0-beta.10', '2.0.0-beta.9')).toBe(true);
  });

  it('fails closed when the remote tag is not valid SemVer', () => {
    expect(isVersionNewer('latest-release', '2.0.0-beta.14')).toBe(false);
  });
});
