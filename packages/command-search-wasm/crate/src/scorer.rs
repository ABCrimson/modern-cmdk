/// Levenshtein distance for fuzzy matching with typo tolerance.
/// Uses two-row DP (O(min(a,b)) memory) instead of full matrix (O(a*b)).
pub fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    // Optimize: always iterate over the shorter string for the inner loop
    if a_len > b_len {
        return levenshtein_distance(b, a);
    }

    // Two-row DP — O(min(a,b)) memory instead of O(a*b)
    let mut prev = Vec::with_capacity(a_len + 1);
    let mut curr = Vec::with_capacity(a_len + 1);

    for i in 0..=a_len {
        prev.push(i);
    }
    curr.resize(a_len + 1, 0);

    for j in 1..=b_len {
        curr[0] = j;
        for i in 1..=a_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            curr[i] = (prev[i] + 1)
                .min(curr[i - 1] + 1)
                .min(prev[i - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[a_len]
}

/// Maximum allowed edit distance based on query length.
pub fn max_typo_tolerance(query_len: usize) -> usize {
    if query_len < 3 {
        0
    } else if query_len < 5 {
        1
    } else if query_len < 8 {
        2
    } else {
        3
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_levenshtein_same() {
        assert_eq!(levenshtein_distance("hello", "hello"), 0);
    }

    #[test]
    fn test_levenshtein_one_char_diff() {
        assert_eq!(levenshtein_distance("hello", "hallo"), 1);
    }

    #[test]
    fn test_levenshtein_empty() {
        assert_eq!(levenshtein_distance("", "hello"), 5);
        assert_eq!(levenshtein_distance("hello", ""), 5);
    }

    #[test]
    fn test_levenshtein_completely_different() {
        assert_eq!(levenshtein_distance("abc", "xyz"), 3);
    }

    #[test]
    fn test_typo_tolerance_short() {
        assert_eq!(max_typo_tolerance(1), 0);
        assert_eq!(max_typo_tolerance(2), 0);
    }

    #[test]
    fn test_typo_tolerance_medium() {
        assert_eq!(max_typo_tolerance(3), 1);
        assert_eq!(max_typo_tolerance(4), 1);
    }

    #[test]
    fn test_typo_tolerance_long() {
        assert_eq!(max_typo_tolerance(5), 2);
        assert_eq!(max_typo_tolerance(7), 2);
    }

    #[test]
    fn test_typo_tolerance_very_long() {
        assert_eq!(max_typo_tolerance(8), 3);
        assert_eq!(max_typo_tolerance(20), 3);
    }
}
