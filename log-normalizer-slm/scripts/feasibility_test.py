from app.utils.confidence_scorer import score_confidence
from app.utils.ocsf_parser import extract_json
from app.utils.prompt_builder import build_prompt


import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig


def load_model():
    model_name = "DeepHat/DeepHat-V1-7B"
    
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16
    )
    
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=quantization_config,
        device_map="auto"
    )
    return tokenizer, model


def run_single_test(tokenizer, model, log, source, example: list | None = None):
    prompt = build_prompt(raw_log=log, source=source, format="json", examples=example)
    model_inputs = tokenizer.apply_chat_template(prompt, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(model_inputs, return_tensors="pt", add_special_tokens=False)
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    output = model.generate(**inputs, do_sample=True,  temperature=0.1, max_new_tokens=3024)
    resp = tokenizer.batch_decode(output)[0].replace(model_inputs, "")
    ocsf = extract_json(resp)
    if ocsf is None:
        return resp, None, 0.0
    score = score_confidence(ocsf)
    return resp, ocsf, score


def main():
    tokenizer, model = load_model()
    
    total = 0
    parsed = 0
    scores = []
    
    for i, log in enumerate([]):
        total += 1
        resp, ocsf, score = run_single_test(tokenizer, model, log['alert'], log['source'], example=[])
        print(resp)
        if ocsf is None:
            print(f"FAIL [{log['source']}]: Could not extract JSON")
            print()
            continue
        
        parsed += 1
        scores.append(score)
        print(f"PASS [{log['source']}]: confidence {score:.2f}")
    
    print(f"\n--- Results ---")
    print(f"JSON parse rate: {parsed}/{total} ({parsed/total*100:.0f}%)")
    print(f"Avg confidence: {sum(scores)/len(scores):.2f}" if scores else "No successful parses")



main()