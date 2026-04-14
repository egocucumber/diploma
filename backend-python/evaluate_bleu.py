import argparse
import json
import torch
from transformers import RobertaTokenizer, T5ForConditionalGeneration
from nltk.translate.bleu_score import corpus_bleu, SmoothingFunction
import os

MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")


def load_test_split(path: str, test_ratio: float = 0.1, limit: int = None):
    with open(path, "r", encoding="utf-8") as f:
        data = [json.loads(line) for line in f]
    split_idx = int(len(data) * (1 - test_ratio))
    test_data = data[split_idx:]
    if limit:
        test_data = test_data[:limit]
    print(f"Test samples: {len(test_data)} (из {len(data)} всего)")
    return test_data


def evaluate(dataset_path: str, limit: int = None):
    print("Loading model...")
    tokenizer = RobertaTokenizer.from_pretrained(MODEL_DIR)
    model = T5ForConditionalGeneration.from_pretrained(MODEL_DIR)
    model.eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    print(f"Device: {device}")

    test_data = load_test_split(dataset_path, limit=limit)

    references = []
    hypotheses = []
    exact_matches = 0

    for i, sample in enumerate(test_data):
        lang = sample["lang"]
        code_before = sample["before"]
        code_after = sample["after"]

        prompt = f"Refactor {lang}: {code_before}"
        inputs = tokenizer(
            prompt, return_tensors="pt", max_length=512, truncation=True
        ).to(device)

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                num_beams=4,
                early_stopping=True,
                no_repeat_ngram_size=3,
            )

        predicted = tokenizer.decode(outputs[0], skip_special_tokens=True)

        ref_tokens = list(code_after)
        hyp_tokens = list(predicted)

        references.append([ref_tokens])
        hypotheses.append(hyp_tokens)

        if predicted.strip() == code_after.strip():
            exact_matches += 1

        if (i + 1) % 10 == 0:
            print(f"  [{i+1}/{len(test_data)}] обработано...")

    smoothing = SmoothingFunction().method1
    bleu = corpus_bleu(references, hypotheses, smoothing_function=smoothing)
    exact_match_rate = exact_matches / len(test_data) * 100

    print("\n" + "=" * 40)
    print(f"  BLEU Score:        {bleu:.4f}  ({bleu*100:.1f}%)")
    print(f"  Exact Match:       {exact_matches}/{len(test_data)}  ({exact_match_rate:.1f}%)")
    print(f"  Samples evaluated: {len(test_data)}")
    print("=" * 40)

    return bleu


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Путь к .jsonl файлу датасета")
    parser.add_argument("--limit", type=int, default=100, help="Кол-во примеров (по умолч. 100)")
    args = parser.parse_args()

    evaluate(args.dataset, limit=args.limit)
