import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel

from typing import Optional
from .inference import run_inference
from app.config import settings

class ModelManager: 
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.is_ready = False
        self.load_error: Optional[str] = None

    def load(self):

        path = settings.base_model_path
        try: 
            quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16
            )

            tokenizer = AutoTokenizer.from_pretrained(path)
            tokenizer.pad_token = tokenizer.eos_token
            self.tokenizer = tokenizer

            model = AutoModelForCausalLM.from_pretrained(
            path,
            quantization_config=quantization_config,
            device_map=settings.device,
            trust_remote_code=True,
            )
            self.model = model

            
            has_adapter = os.path.exists(os.path.join(settings.adapter_path, "adapter_config.json"))

            if has_adapter: 
                self.model = PeftModel.from_pretrained(self.model, settings.adapter_path)
            
            self.is_ready = True

        except OSError: 
            self.load_error = f"Model not found at {path}"
        except RuntimeError as err:
            if "CUDA out of memory" in str(err):
                self.load_error = "GPU OOM. Try load_in_8bit=True or use smaller model."
            else:
                self.load_error = f"Runtime error: {str(err)}"
        except Exception as err:
            self.load_error = f"Unexpected error: {str(err)}"
                        



    def generate(self, prompt: list[dict]): 
        if not self.is_ready: 
            raise RuntimeError("Model not loaded")
        
        return run_inference(self.model, self.tokenizer, prompt, settings)





model_manager = ModelManager()