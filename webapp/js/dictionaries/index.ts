/**
 * Local Dictionary Module
 *
 * Provides local dictionary lookup functionality for the text reading interface.
 *
 * @license Unlicense <http://unlicense.org/>
 */

// Export API functions
export {
  lookupLocal,
  hasLocalDictionaries,
  shouldUseOnline,
  getLocalDictMode,
  clearModeCache,
  formatResults,
  formatResult,
  DictionaryMode,
  type LocalDictResult,
  type LocalDictLookupResponse,
  type DictionaryModeValue
} from './local_dictionary_api';

// The Alpine `local_dictionary_panel` was deleted under R6e (headless cut):
// it had no runtime consumer (tree-shaken from every bundle) and was the last
// thing pulling Alpine into the dictionary graph.
