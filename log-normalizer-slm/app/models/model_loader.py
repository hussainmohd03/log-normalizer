from typing import Optional

class ModelManager: 
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.is_ready = False
        self.load_error: Optional[str]

    def load(self):
        pass

    def generate(self): 
        pass





model_manager = ModelManager()