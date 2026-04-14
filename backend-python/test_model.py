from transformers import RobertaTokenizer, T5ForConditionalGeneration
import torch

MODEL_DIR = 'model'
tokenizer = RobertaTokenizer.from_pretrained("Salesforce/codet5-base", use_fast=False)
model     = T5ForConditionalGeneration.from_pretrained(MODEL_DIR)
model.eval()

print(f"Tokenizer vocab size: {len(tokenizer)}")
print(f"Model vocab size:     {model.config.vocab_size}")
print(f"Embedding size:       {model.shared.weight.shape[0]}")

code = '''def get_user(id):
    result = None
    for u in users:
        if u.id == id:
            result = u
    return result'''

inputs = tokenizer(f'Refactor python: {code}', return_tensors='pt', max_length=512, truncation=True)
ids = inputs['input_ids'][0]
print(f"Max token ID in input: {ids.max().item()}")
print(f"Any out of range: {(ids >= model.shared.weight.shape[0]).any().item()}")

inputs['input_ids'] = ids.clamp(0, model.config.vocab_size - 1).unsqueeze(0)

with torch.no_grad():
    out = model.generate(**inputs, max_new_tokens=256, num_beams=4)

print("\n=== Результат ===")
print(tokenizer.decode(out[0], skip_special_tokens=True))
