use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub id: String,
    pub score: f64,
    pub matches: Vec<(usize, usize)>,
}

pub struct TrigramIndex {
    items: Vec<(String, String)>,
    trigram_map: HashMap<String, Vec<usize>>,
}

impl TrigramIndex {
    pub fn new() -> Self {
        Self {
            items: Vec::new(),
            trigram_map: HashMap::new(),
        }
    }

    pub fn build_from_json(&mut self, json: &str) -> Result<(), String> {
        let parsed: Vec<(String, String)> =
            serde_json::from_str(json).map_err(|e| e.to_string())?;

        // Pre-allocate trigram map with estimated capacity (avg 8 trigrams per item)
        let estimated_trigrams = parsed.len() * 8;
        self.items = parsed;
        self.trigram_map.clear();
        self.trigram_map.reserve(estimated_trigrams);

        for (idx, (_, value)) in self.items.iter().enumerate() {
            let lower = value.to_lowercase();
            for trigram in extract_trigrams(&lower) {
                self.trigram_map.entry(trigram).or_default().push(idx);
            }
        }

        Ok(())
    }

    pub fn search(&self, query: &str, max_results: usize) -> Vec<SearchResult> {
        let lower_query = query.to_lowercase();
        let query_trigrams = extract_trigrams(&lower_query);

        if query_trigrams.is_empty() {
            return Vec::new();
        }

        // Pre-allocate score map — most queries match a fraction of items
        let mut scores: HashMap<usize, f64> = HashMap::with_capacity(self.items.len() / 4);

        for trigram in &query_trigrams {
            if let Some(indices) = self.trigram_map.get(trigram) {
                for &idx in indices {
                    *scores.entry(idx).or_insert(0.0) += 1.0;
                }
            }
        }

        let trigram_count = query_trigrams.len() as f64;
        let mut results: Vec<SearchResult> = Vec::with_capacity(scores.len().min(max_results));

        for (idx, count) in scores {
            let score = count / trigram_count;
            if score > 0.1 {
                let (id, value) = &self.items[idx];
                let matches = find_match_ranges(&value.to_lowercase(), &lower_query);
                results.push(SearchResult {
                    id: id.clone(),
                    score,
                    matches,
                });
            }
        }

        results.sort_unstable_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(max_results);
        results
    }

    pub fn clear(&mut self) {
        self.items.clear();
        self.trigram_map.clear();
    }
}

fn extract_trigrams(s: &str) -> Vec<String> {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 3 {
        return vec![s.to_string()];
    }
    chars.windows(3).map(|w| w.iter().collect()).collect()
}

fn find_match_ranges(haystack: &str, needle: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(needle) {
        let abs_pos = start + pos;
        ranges.push((abs_pos, abs_pos + needle.len()));
        start = abs_pos + 1;
    }
    ranges
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_trigrams_short() {
        let trigrams = extract_trigrams("ab");
        assert_eq!(trigrams, vec!["ab"]);
    }

    #[test]
    fn test_extract_trigrams_exact() {
        let trigrams = extract_trigrams("abc");
        assert_eq!(trigrams, vec!["abc"]);
    }

    #[test]
    fn test_extract_trigrams_longer() {
        let trigrams = extract_trigrams("abcde");
        assert_eq!(trigrams, vec!["abc", "bcd", "cde"]);
    }

    #[test]
    fn test_index_and_search() {
        let mut index = TrigramIndex::new();
        let json = r#"[["1", "Apple"], ["2", "Banana"], ["3", "Apricot"]]"#;
        index.build_from_json(json).unwrap();

        let results = index.search("apple", 10);
        assert!(!results.is_empty());
        assert_eq!(results[0].id, "1");
    }

    #[test]
    fn test_search_no_match() {
        let mut index = TrigramIndex::new();
        let json = r#"[["1", "Apple"]]"#;
        index.build_from_json(json).unwrap();

        let results = index.search("xyz", 10);
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_case_insensitive() {
        let mut index = TrigramIndex::new();
        let json = r#"[["1", "Hello World"]]"#;
        index.build_from_json(json).unwrap();

        let results = index.search("HELLO", 10);
        assert!(!results.is_empty());
    }

    #[test]
    fn test_search_max_results() {
        let mut index = TrigramIndex::new();
        let json = r#"[["1", "Apple"], ["2", "Application"], ["3", "App Store"]]"#;
        index.build_from_json(json).unwrap();

        let results = index.search("app", 1);
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_clear() {
        let mut index = TrigramIndex::new();
        let json = r#"[["1", "Apple"]]"#;
        index.build_from_json(json).unwrap();

        index.clear();
        let results = index.search("apple", 10);
        assert!(results.is_empty());
    }

    #[test]
    fn test_find_match_ranges() {
        let ranges = find_match_ranges("hello world hello", "hello");
        assert_eq!(ranges, vec![(0, 5), (12, 17)]);
    }

    #[test]
    fn test_find_match_ranges_no_match() {
        let ranges = find_match_ranges("hello world", "xyz");
        assert!(ranges.is_empty());
    }

    #[test]
    fn test_unicode_trigrams() {
        let trigrams = extract_trigrams("café");
        assert_eq!(trigrams.len(), 2); // "caf", "afé"
    }

    #[test]
    fn test_sorted_by_score() {
        let mut index = TrigramIndex::new();
        let json = r#"[["1", "Application"], ["2", "Apple"], ["3", "Banana"]]"#;
        index.build_from_json(json).unwrap();

        let results = index.search("apple", 10);
        assert!(results.len() >= 1);
        // Results should be sorted by score descending
        for i in 1..results.len() {
            assert!(results[i - 1].score >= results[i].score);
        }
    }
}
