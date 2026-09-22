/*
  The release history the interface shows. It is bundled with the application, so Version History
  works on an isolated network: nothing here reads the API or GitHub.
*/
import { readReleaseHistory } from '../../shared/releaseHistory.js';
import history from '../../shared/release-history.json';

export const releases = readReleaseHistory(history);
