import torch

def run_inference(model, tokenizer, prompt: list[dict], settings) -> str:

    model_inputs = tokenizer.apply_chat_template(
        prompt, tokenize=False, add_generation_prompt=True
    )

    inputs = tokenizer(model_inputs, return_tensors="pt", add_special_tokens=False)

    inputs = {k: v.to(model.device) for k, v in inputs.items()}

    input_length = inputs["input_ids"].shape[1]


    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            do_sample=True,
            temperature=settings.temperature,
            max_new_tokens=settings.max_new_tokens,
            pad_token_id=tokenizer.eos_token_id,
        )


    new_tokens = output_ids[0][input_length:]


    return tokenizer.decode(new_tokens, skip_special_tokens=True)