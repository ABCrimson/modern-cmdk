use wasm_bindgen::prelude::*;

mod trigram;
mod scorer;

#[wasm_bindgen]
pub struct WasmSearchEngine {
    index: trigram::TrigramIndex,
}

#[wasm_bindgen]
impl WasmSearchEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            index: trigram::TrigramIndex::new(),
        }
    }

    pub fn index_items(&mut self, items: &str) -> Result<(), JsValue> {
        self.index.build_from_json(items).map_err(|e| JsValue::from_str(&e))
    }

    pub fn search(&self, query: &str, max_results: usize) -> Result<JsValue, JsValue> {
        let results = self.index.search(query, max_results);
        serde_wasm_bindgen::to_value(&results).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn clear(&mut self) {
        self.index.clear();
    }
}
