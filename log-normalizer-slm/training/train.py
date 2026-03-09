import yaml 
import torch 
from pathlib import Path
from trl import SFTTrainer, SFTConfig
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, TaskType, prepare_model_for_kbit_training

# ------- Load Config
parent_dir = Path(__file__).parent
config_path = parent_dir / 'config' / 'training_config.yaml'
splits_path = parent_dir / 'splits' 

with open(config_path, 'r') as f:
    config = yaml.safe_load(f)

model_config = config['model']
lora_config = config['lora']
training_config = config['training']
data = config['data']




# ------- Load tokenizer 

tokenizer = AutoTokenizer.from_pretrained(model_config['base_model'])

# ------- load Dataset

dataset = load_dataset("json", data_files={
    'train': f'{splits_path}/{data["train_file"]}',
    'validation':f'{splits_path}/{data["val_file"]}',
})

def format_to_prompt_completion(example):
    """
    Convert chat messages to prompt-completion format.
    Uses apply_chat_template(tokenize=False) for the full string,
    then splits at the assistant marker.
    """
    full_text = tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )
    
    # Split at the assistant response boundary
    # Foundation-Sec uses <|assistant|>\n as the marker
    split_marker = "<|assistant|>\n"
    
    if split_marker in full_text:
        parts = full_text.split(split_marker, 1)  # split only on first occurrence
        prompt = parts[0] + split_marker           # everything up to and including marker
        completion = parts[1]                       # the OCSF JSON response
    else:
        # Fallback: treat everything as text (no masking)
        prompt = ""
        completion = full_text
    
    return {"prompt": prompt, "completion": completion}

dataset = dataset.map(format_to_prompt_completion, remove_columns=["messages"])

# Verify the split worked
sample = dataset["train"][0]
print(f"Prompt ends with: ...{sample['prompt'][-50:]}")
print(f"Completion starts with: {sample['completion'][:80]}...")
print(f"Prompt length: {len(sample['prompt'])} chars")
print(f"Completion length: {len(sample['completion'])} chars")


# ------- Load model with Quantanization 

quantization_config = BitsAndBytesConfig(
    load_in_4bit=model_config['load_in_4bit'],
    bnb_4bit_compute_dtype=torch.bfloat16, 
    bnb_4bit_quant_type=model_config['bnb_4bit_quant_type'], 
    bnb_4bit_use_double_quant=model_config['bnb_4bit_use_double_quant']
)

model = AutoModelForCausalLM.from_pretrained(
    model_config['base_model'],
    quantization_config=quantization_config,
    device_map='auto',
    trust_remote_code=True,
)


# ------- prepare for QloRA and apply LoRA  

model = prepare_model_for_kbit_training(model)

lora = LoraConfig(
    r=lora_config['r'], 
    lora_alpha=lora_config['lora_alpha'],
    target_modules=lora_config['target_modules'], 
    lora_dropout=lora_config['lora_dropout'], 
    bias=lora_config['bias'],
    task_type=TaskType.CAUSAL_LM
)


model = get_peft_model(model, lora)
model.print_trainable_parameters()

torch.cuda.empty_cache()

# ------- Training arguments

output_dir = model_config['output_dir']
training_args = SFTConfig(
    output_dir=output_dir,
    num_train_epochs=training_config['num_train_epochs'], 
    per_device_train_batch_size=training_config['per_device_train_batch_size'], 
    gradient_accumulation_steps=training_config['gradient_accumulation_steps'], 
    learning_rate=training_config['learning_rate'],
    warmup_ratio=training_config['warmup_ratio'], 
    logging_steps=training_config['logging_steps'], 
    save_steps=training_config['save_steps'],
    eval_steps=training_config['eval_steps'],
    eval_strategy=training_config['eval_strategy'], 
    save_strategy=training_config['save_strategy'],
    save_total_limit=training_config['save_total_limit'],
    load_best_model_at_end=training_config['load_best_model_at_end'],
    metric_for_best_model=training_config['metric_for_best_model'],
    bf16=training_config['bf16'], 
    max_length=training_config['max_length'],
    gradient_checkpointing=training_config['gradient_checkpointing'],
    dataloader_pin_memory=False,
    optim="adamw_torch", 
    completion_only_loss=True
) 

# ------- Create Trainer

trainer = SFTTrainer(
    model=model, 
    args=training_args,
    train_dataset=dataset['train'],
    eval_dataset=dataset['validation'],
    processing_class=tokenizer
)


# ------- Train 

print("Starting training...")
trainer.train()


# ------- Save adapter 

trainer.model.save_pretrained(output_dir)
tokenizer.save_pretrained(output_dir)
print(f"Adapter saved to {output_dir}")

# Verify
adapter_path = Path(output_dir) / 'adapter_config.json'
assert adapter_path.exists(), f"adapter_config.json not found in {output_dir}"
print(f"Verified: {adapter_path} exists")
