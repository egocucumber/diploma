import ast
import os
import re
import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel
import uvicorn

app = FastAPI()

BASE_MODEL_DIR = os.environ.get("MODEL_DIR", os.path.join(os.path.dirname(__file__), "model"))
ADAPTER_DIR = os.environ.get("ADAPTER_DIR", os.path.join(os.path.dirname(__file__), "adapter"))

print("Loading model...")
device = "cuda" if torch.cuda.is_available() else "cpu"
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_DIR, local_files_only=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL_DIR,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32,
    device_map=device,
    local_files_only=True,
)
model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
model.eval()
print(f"Model loaded on {device}")

EXTENSION_TO_LANG = {
    ".py":   "python",
    ".js":   "javascript",
    ".ts":   "typescript",
    ".go":   "go",
    ".java": "java",
}

PATTERN_INFO = {
    "long_method":          {"name": "Long Method",              "template": "The longest function spans {lines} lines. Consider extracting logical blocks into smaller, well-named helper functions."},
    "deep_nesting":         {"name": "Deep Nesting",             "template": "Code reaches {depth} levels of indentation. Reduce nesting by applying guard clauses or extracting inner blocks into separate functions."},
    "magic_numbers":        {"name": "Magic Numbers",            "template": "Numeric literals are used directly in the code. Extract them into named constants to improve readability."},
    "high_complexity":      {"name": "High Complexity",          "template": "Cyclomatic complexity is estimated at {complexity}. Simplify branching logic by decomposing conditions."},
    "long_parameter_list":  {"name": "Long Parameter List",      "template": "Function accepts {params} parameters — more than 4 is considered a code smell. Group related parameters into a data class."},
    "redundant_code":       {"name": "Redundant Code",           "template": "ML analysis found redundant constructs. Refactoring reduces {lines_before} → {lines_after} lines."},
    "empty_catch":          {"name": "Empty Catch Block",        "template": "Exception is silently swallowed. At minimum, log the error or re-raise it so failures don't go unnoticed."},
    "dead_code":            {"name": "Dead Code",                "template": "One or more private functions are defined but never called. Remove unused code to reduce maintenance burden."},
    "commented_out_code":   {"name": "Commented-Out Code",       "template": "Several consecutive lines of commented-out code were detected. Remove obsolete code — version control preserves history."},
    "god_function":         {"name": "God Function",             "template": "A single function spans {lines} lines with cyclomatic complexity of {complexity}. Split it into focused, single-purpose functions."},
    "duplicate_code":       {"name": "Duplicate Code",           "template": "Similar code blocks detected in {count} different functions. Extract the repeated logic into a shared helper function."},
    "too_many_returns":     {"name": "Too Many Returns",         "template": "Function has {count} return statements. Consider restructuring to reduce exit points and improve readability."},
    "large_class":          {"name": "Large Class",              "template": "Class '{name}' has {methods} methods. Consider splitting into smaller, focused classes following the Single Responsibility Principle."},
    "inconsistent_naming":  {"name": "Inconsistent Naming",      "template": "Mixed naming conventions detected: both snake_case and camelCase used in the same file. Stick to one convention throughout."},
    "feature_envy":         {"name": "Feature Envy",             "template": "Function '{name}' accesses external object attributes more than its own data, suggesting it belongs in another class."},
}


class CodeRequest(BaseModel):
    filename: str
    code: str


class DetectRequest(BaseModel):
    filename: str
    code: str


class DetectResponse(BaseModel):
    pattern: str
    explanation: str
    language: str
    fragment: str
    fragment_offset: int
    fragment_line_count: int
    complexity_before: int


class RefactorRequest(BaseModel):
    language: str
    pattern: str
    fragment: str
    original_code: str
    fragment_offset: int
    fragment_line_count: int


class RefactorResponse(BaseModel):
    refactored_code: str
    confidence: float
    complexity_after: int


class RefactorSuggestion(BaseModel):
    pattern: str
    confidence: float
    refactored_code: str
    explanation: str
    language: str
    complexity_before: int
    complexity_after: int


def detect_lang(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return EXTENSION_TO_LANG.get(ext, "python")


def normalize_indent(code: str) -> str:
    return code.replace("\t", "    ")


def cyclomatic_complexity(code: str, lang: str) -> int:
    if lang == "python":
        try:
            tree = ast.parse(code)
            cc = 1
            for node in ast.walk(tree):
                if isinstance(node, (ast.If, ast.While, ast.For, ast.ExceptHandler, ast.With, ast.AsyncFor, ast.AsyncWith)):
                    cc += 1
                elif isinstance(node, ast.BoolOp):
                    cc += len(node.values) - 1
            return cc
        except SyntaxError:
            pass
    branch_kws = [r'\bif\b', r'\belif\b', r'\belse\b', r'\bfor\b', r'\bwhile\b', r'\bswitch\b', r'\bcase\b', r'\bcatch\b', r'\btry\b', r'&&', r'\|\|', r'\?(?!\.)']
    cc = 1
    for kw in branch_kws:
        cc += len(re.findall(kw, code))
    return cc


def max_indent_depth(code: str) -> int:
    code = normalize_indent(code)
    depth = 0
    for line in code.split("\n"):
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        depth = max(depth, indent // 4)
    return depth


def max_function_lines(code: str, lang: str) -> int:
    if lang == "python":
        try:
            tree = ast.parse(code)
            max_lines = 0
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    max_lines = max(max_lines, node.end_lineno - node.lineno + 1)
            return max_lines
        except SyntaxError:
            pass
    lines = code.split("\n")
    func_starts = [i for i, l in enumerate(lines) if re.match(r'^\s*(public|private|protected|static|async|func|def|function)\s+\w+\s*\(', l)]
    if not func_starts:
        return len(lines)
    max_lines = 0
    for idx, start in enumerate(func_starts):
        end = func_starts[idx + 1] if idx + 1 < len(func_starts) else len(lines)
        max_lines = max(max_lines, end - start)
    return max_lines


def count_params(code: str, lang: str) -> int:
    if lang == "python":
        try:
            tree = ast.parse(code)
            max_p = 0
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    p = len(node.args.args) + len(node.args.posonlyargs)
                    max_p = max(max_p, p)
            return max_p
        except SyntaxError:
            pass
    matches = re.findall(r'\(([^)]{20,})\)', code)
    if not matches:
        return 0
    return max(m.count(',') + 1 for m in matches)


def has_empty_catch(code: str, lang: str) -> bool:
    if lang == "python":
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, ast.ExceptHandler):
                    if all(isinstance(s, ast.Pass) for s in node.body):
                        return True
                    if all(isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) for s in node.body):
                        return True
            return False
        except SyntaxError:
            pass
    return bool(re.search(r'catch\s*\([^)]*\)\s*\{\s*\}', code))


def has_dead_code(code: str, lang: str) -> bool:
    if lang == "python":
        try:
            tree = ast.parse(code)
            defined, used = set(), set()
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    defined.add(node.name)
                elif isinstance(node, ast.Name):
                    used.add(node.id)
                elif isinstance(node, ast.Attribute):
                    used.add(node.attr)
            return len({n for n in defined if n.startswith("_") and n not in used}) > 0
        except SyntaxError:
            pass
    return False


def has_commented_out_code(code: str, lang: str) -> bool:
    comment_char = "#" if lang == "python" else "//"
    code_like = re.compile(r'[=(){};]|def |function |return |if |for |var |let |const ')
    consecutive = 0
    for line in code.split("\n"):
        stripped = line.strip()
        if stripped.startswith(comment_char):
            content = stripped[len(comment_char):].strip()
            if code_like.search(content):
                consecutive += 1
                if consecutive >= 3:
                    return True
            else:
                consecutive = 0
        else:
            consecutive = 0
    return False


def has_magic_numbers(code: str, lang: str) -> bool:
    WHITELIST = {0, 1, 2, 100, 200, 201, 204, 400, 401, 403, 404, 422, 500, 503}
    comment_char = "#" if lang == "python" else "//"
    clean_lines = []
    for line in code.split("\n"):
        stripped = line.split(comment_char)[0]
        stripped = re.sub(r'"[^"]*"', '""', stripped)
        stripped = re.sub(r"'[^']*'", "''", stripped)
        clean_lines.append(stripped)
    clean = re.sub(r'\b[A-Z_]{2,}\s*=\s*[\d.]+', '', "\n".join(clean_lines))
    for m in re.finditer(r'(?<![.\w])\d+(?!\.\d)(?!\w)', clean):
        if int(m.group()) not in WHITELIST:
            return True
    return False


def has_duplicate_code(code: str, lang: str) -> tuple[bool, int]:
    if lang == "python":
        try:
            tree = ast.parse(code)
            bodies = []
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    body_lines = []
                    for n in ast.walk(node):
                        if isinstance(n, (ast.If, ast.For, ast.While, ast.Assign, ast.Return)):
                            body_lines.append(ast.dump(n))
                    if len(body_lines) >= 3:
                        bodies.append(tuple(body_lines[:5]))
            seen, dupes = set(), 0
            for b in bodies:
                if b in seen:
                    dupes += 1
                seen.add(b)
            return dupes > 0, dupes + 1
        except SyntaxError:
            pass
    lines = [l.strip() for l in code.split("\n") if l.strip() and not l.strip().startswith(("//", "#", "/*", "*"))]
    chunk_size = 4
    chunks = [tuple(lines[i:i+chunk_size]) for i in range(len(lines) - chunk_size + 1)]
    seen, dupes = set(), 0
    for c in chunks:
        if len(set(c)) < 2:
            continue
        if c in seen:
            dupes += 1
        seen.add(c)
    return dupes >= 2, dupes


def has_too_many_returns(code: str, lang: str) -> tuple[bool, int]:
    if lang == "python":
        try:
            tree = ast.parse(code)
            max_returns = 0
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    returns = sum(1 for n in ast.walk(node) if isinstance(n, ast.Return))
                    max_returns = max(max_returns, returns)
            return max_returns > 3, max_returns
        except SyntaxError:
            pass
    count = len(re.findall(r'\breturn\b', code))
    return count > 3, count


def has_large_class(code: str, lang: str) -> tuple[bool, str, int]:
    if lang == "python":
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    methods = sum(1 for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
                    if methods >= 8:
                        return True, node.name, methods
            return False, "", 0
        except SyntaxError:
            pass
    classes = re.findall(r'class\s+(\w+)', code)
    if not classes:
        return False, "", 0
    method_count = len(re.findall(r'\b(def |function |public |private |protected )\s*\w+\s*\(', code))
    if method_count >= 8:
        return True, classes[0], method_count
    return False, "", 0


def has_inconsistent_naming(code: str, lang: str) -> bool:
    identifiers = re.findall(r'\b([a-zA-Z_]\w*)\s*[=\(]', code)
    has_snake = any('_' in id and id.islower() for id in identifiers if len(id) > 3 and not id.startswith('_'))
    has_camel = any(re.match(r'^[a-z][a-zA-Z0-9]*[A-Z]', id) for id in identifiers if len(id) > 3)
    return has_snake and has_camel


def has_feature_envy(code: str, lang: str) -> tuple[bool, str]:
    if lang == "python":
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                self_access = 0
                external_access = 0
                ext_objects: dict[str, int] = {}
                for n in ast.walk(node):
                    if isinstance(n, ast.Attribute):
                        if isinstance(n.value, ast.Name):
                            if n.value.id == 'self':
                                self_access += 1
                            else:
                                external_access += 1
                                ext_objects[n.value.id] = ext_objects.get(n.value.id, 0) + 1
                if external_access > self_access + 2 and external_access >= 4:
                    top = max(ext_objects, key=ext_objects.get)
                    return True, node.name
            return False, ""
        except SyntaxError:
            pass
    return False, ""


def is_output_corrupted(original: str, refactored: str) -> bool:
    if not refactored or not refactored.strip():
        return True
    mojibake = set('\ufffd\u0400\u0401\u0402\u0403\u0404\u0405\u0406\u0407\u0408\u0409'
                   '\u040a\u040b\u040c\u040d\u040e\u040f'
                   '\u0450\u0451\u0452\u0453\u0454\u0455\u0456\u0457\u0458\u0459'
                   '\u045a\u045b\u045c\u045d\u045e\u045f')
    if sum(1 for c in refactored if c in mojibake) > 3:
        return True
    if len(refactored.strip()) < len(original.strip()) * 0.2:
        return True
    def ascii_ratio(s):
        return sum(1 for c in s if ord(c) < 128) / len(s) if s else 1.0
    if ascii_ratio(original) > 0.85 and ascii_ratio(refactored) < ascii_ratio(original) - 0.15:
        return True
    return False


def detect_pattern(code: str, refactored: str, lang: str) -> tuple[str, str]:
    lines_before = len(code.split("\n"))
    lines_after = len(refactored.split("\n"))
    depth = max_indent_depth(code)
    cc = cyclomatic_complexity(code, lang)
    params = count_params(code, lang)
    max_fn_lines = max_function_lines(code, lang)

    if has_empty_catch(code, lang):
        i = PATTERN_INFO["empty_catch"]
        return i["name"], i["template"]
    if depth >= 4:
        i = PATTERN_INFO["deep_nesting"]
        return i["name"], i["template"].format(depth=depth)
    if cc >= 10:
        i = PATTERN_INFO["high_complexity"]
        return i["name"], i["template"].format(complexity=cc)
    if max_fn_lines >= 40 and cc >= 7:
        i = PATTERN_INFO["god_function"]
        return i["name"], i["template"].format(lines=max_fn_lines, complexity=cc)
    if max_fn_lines >= 60:
        i = PATTERN_INFO["long_method"]
        return i["name"], i["template"].format(lines=max_fn_lines)
    if params >= 5:
        i = PATTERN_INFO["long_parameter_list"]
        return i["name"], i["template"].format(params=params)
    if has_dead_code(code, lang):
        i = PATTERN_INFO["dead_code"]
        return i["name"], i["template"]
    if has_commented_out_code(code, lang):
        i = PATTERN_INFO["commented_out_code"]
        return i["name"], i["template"]
    if has_magic_numbers(code, lang):
        i = PATTERN_INFO["magic_numbers"]
        return i["name"], i["template"]
    if lines_after < lines_before * 0.75 and lines_before > 10:
        i = PATTERN_INFO["redundant_code"]
        return i["name"], i["template"].format(lines_before=lines_before, lines_after=lines_after)

    is_dup, dup_count = has_duplicate_code(code, lang)
    if is_dup:
        i = PATTERN_INFO["duplicate_code"]; return i["name"], i["template"].format(count=dup_count)

    has_ret, ret_count = has_too_many_returns(code, lang)
    if has_ret:
        i = PATTERN_INFO["too_many_returns"]; return i["name"], i["template"].format(count=ret_count)

    is_large, class_name, method_count = has_large_class(code, lang)
    if is_large:
        i = PATTERN_INFO["large_class"]; return i["name"], i["template"].format(name=class_name, methods=method_count)

    if has_inconsistent_naming(code, lang):
        i = PATTERN_INFO["inconsistent_naming"]; return i["name"], i["template"]

    is_envious, fn_name = has_feature_envy(code, lang)
    if is_envious:
        i = PATTERN_INFO["feature_envy"]; return i["name"], i["template"].format(name=fn_name)

    return "Clean Code", "No refactoring needed — code already follows best practices."


MAX_DIRECT_LINES = 40


def extract_smell_fragment(code: str, lang: str) -> tuple[str, int]:
    MAX_FRAGMENT_LINES = 60

    if lang == "python":
        try:
            tree = ast.parse(code)
            lines = code.split("\n")
            best_node, best_score = None, 0
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                fn_lines = node.end_lineno - node.lineno + 1
                fn_cc = sum(1 for n in ast.walk(node) if isinstance(n, (ast.If, ast.While, ast.For, ast.ExceptHandler)))
                score = fn_lines + fn_cc * 3
                if score > best_score:
                    best_score = score
                    best_node = node
            if best_node is not None:
                start = best_node.lineno - 1
                end = min(best_node.end_lineno, start + MAX_FRAGMENT_LINES)
                return "\n".join(lines[start:end]), start
        except SyntaxError:
            pass

    lines = code.split("\n")
    func_starts = [i for i, l in enumerate(lines)
                   if re.match(r'^\s*(export\s+)?(async\s+)?function\s+\w+|^\s*(public|private|protected|static|async|func)\s+\w+\s*\(', l)]

    if func_starts:
        best_start, best_len = 0, 0
        for idx, start in enumerate(func_starts):
            end = func_starts[idx + 1] if idx + 1 < len(func_starts) else len(lines)
            if end - start > best_len:
                best_len = end - start
                best_start = start
        end = min(best_start + MAX_FRAGMENT_LINES, len(lines))
        return "\n".join(lines[best_start:end]), best_start

    return "\n".join(lines[:MAX_FRAGMENT_LINES]), 0


def splice_fragment_back(original: str, refactored_fragment: str, offset: int, fragment_line_count: int) -> str:
    lines = original.split("\n")
    end = min(offset + fragment_line_count, len(lines))
    return "\n".join(lines[:offset] + refactored_fragment.split("\n") + lines[end:])


def _call_model(lang: str, input_code: str) -> tuple[str, float]:
    prompt = f"<refactor>\nlanguage: {lang}\ninput:\n{input_code}\noutput:\n"
    max_new = 80 if device == "cpu" else 300
    inputs = tokenizer(prompt, return_tensors="pt", max_length=256, truncation=True).to(device)
    prompt_len = inputs["input_ids"].shape[1]

    end_token_id = tokenizer.convert_tokens_to_ids("</refactor>")
    stop_ids = [end_token_id] if end_token_id != tokenizer.unk_token_id else []

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new,
            do_sample=False,
            temperature=1.0,
            eos_token_id=stop_ids if stop_ids else tokenizer.eos_token_id,
            pad_token_id=tokenizer.pad_token_id,
            output_scores=True,
            return_dict_in_generate=True,
        )

    generated_ids = outputs.sequences[0, prompt_len:]
    refactored_fragment = tokenizer.decode(generated_ids, skip_special_tokens=True)
    refactored_fragment = refactored_fragment.split("</refactor>")[0].rstrip()

    if outputs.scores:
        scores = torch.stack(outputs.scores, dim=1)  # (1, T, vocab)
        probs = torch.softmax(scores, dim=-1)
        n = min(len(generated_ids), probs.shape[1])
        token_probs = probs[0, :n, :].gather(1, generated_ids[:n].unsqueeze(1)).squeeze(1)
        confidence = float(min(0.95, max(0.1, token_probs.mean().item())))
    else:
        confidence = 0.75

    return refactored_fragment, confidence


def generate_refactored(lang: str, code: str) -> tuple[str, float]:
    lines = code.split("\n")
    use_fragment = len(lines) > MAX_DIRECT_LINES

    if use_fragment:
        fragment, offset = extract_smell_fragment(code, lang)
        fragment_line_count = len(fragment.split("\n"))
        input_code = fragment
    else:
        input_code = code
        offset = 0
        fragment_line_count = len(lines)

    refactored_fragment, confidence = _call_model(lang, input_code)

    if is_output_corrupted(input_code, refactored_fragment):
        return code, 0.0

    if use_fragment:
        full_refactored = splice_fragment_back(code, refactored_fragment, offset, fragment_line_count)
    else:
        full_refactored = refactored_fragment

    return full_refactored, confidence


def detect_pattern_on_code(code: str, lang: str) -> tuple[str, str] | None:
    depth = max_indent_depth(code)
    cc = cyclomatic_complexity(code, lang)
    params = count_params(code, lang)
    max_fn_lines = max_function_lines(code, lang)

    if has_empty_catch(code, lang):
        i = PATTERN_INFO["empty_catch"]; return i["name"], i["template"]
    if depth >= 4:
        i = PATTERN_INFO["deep_nesting"]; return i["name"], i["template"].format(depth=depth)
    if cc >= 10:
        i = PATTERN_INFO["high_complexity"]; return i["name"], i["template"].format(complexity=cc)
    if max_fn_lines >= 40 and cc >= 7:
        i = PATTERN_INFO["god_function"]; return i["name"], i["template"].format(lines=max_fn_lines, complexity=cc)
    if max_fn_lines >= 60:
        i = PATTERN_INFO["long_method"]; return i["name"], i["template"].format(lines=max_fn_lines)
    if params >= 5:
        i = PATTERN_INFO["long_parameter_list"]; return i["name"], i["template"].format(params=params)
    if has_dead_code(code, lang):
        i = PATTERN_INFO["dead_code"]; return i["name"], i["template"]
    if has_commented_out_code(code, lang):
        i = PATTERN_INFO["commented_out_code"]; return i["name"], i["template"]
    if has_magic_numbers(code, lang):
        i = PATTERN_INFO["magic_numbers"]; return i["name"], i["template"]

    is_dup, dup_count = has_duplicate_code(code, lang)
    if is_dup:
        i = PATTERN_INFO["duplicate_code"]; return i["name"], i["template"].format(count=dup_count)

    has_ret, ret_count = has_too_many_returns(code, lang)
    if has_ret:
        i = PATTERN_INFO["too_many_returns"]; return i["name"], i["template"].format(count=ret_count)

    is_large, class_name, method_count = has_large_class(code, lang)
    if is_large:
        i = PATTERN_INFO["large_class"]; return i["name"], i["template"].format(name=class_name, methods=method_count)

    if has_inconsistent_naming(code, lang):
        i = PATTERN_INFO["inconsistent_naming"]; return i["name"], i["template"]

    is_envious, fn_name = has_feature_envy(code, lang)
    if is_envious:
        i = PATTERN_INFO["feature_envy"]; return i["name"], i["template"].format(name=fn_name)

    return None


@app.post("/detect", response_model=DetectResponse)
async def detect(request: DetectRequest):
    lang = detect_lang(request.filename)
    cc_before = cyclomatic_complexity(request.code, lang)
    result = detect_pattern_on_code(request.code, lang)

    if result is None:
        fragment, offset = extract_smell_fragment(request.code, lang)
        return DetectResponse(
            pattern="Clean Code",
            explanation="No refactoring needed — code already follows best practices.",
            language=lang,
            fragment=fragment,
            fragment_offset=offset,
            fragment_line_count=len(fragment.split("\n")),
            complexity_before=cc_before,
        )

    pattern_name, explanation = result
    lines = request.code.split("\n")
    if len(lines) > MAX_DIRECT_LINES:
        fragment, offset = extract_smell_fragment(request.code, lang)
    else:
        fragment, offset = request.code, 0

    return DetectResponse(
        pattern=pattern_name,
        explanation=explanation,
        language=lang,
        fragment=fragment,
        fragment_offset=offset,
        fragment_line_count=len(fragment.split("\n")),
        complexity_before=cc_before,
    )


@app.post("/refactor", response_model=RefactorResponse)
async def refactor(request: RefactorRequest):
    refactored_fragment, confidence = _call_model(request.language, request.fragment)

    if is_output_corrupted(request.fragment, refactored_fragment):
        full_refactored = request.original_code
        confidence = 0.0
    else:
        if request.fragment_offset > 0 or request.fragment_line_count < len(request.original_code.split("\n")):
            full_refactored = splice_fragment_back(
                request.original_code, refactored_fragment,
                request.fragment_offset, request.fragment_line_count
            )
        else:
            full_refactored = refactored_fragment

    return RefactorResponse(
        refactored_code=full_refactored,
        confidence=confidence,
        complexity_after=cyclomatic_complexity(full_refactored, request.language),
    )


@app.post("/predict", response_model=RefactorSuggestion)
async def predict_refactoring(request: CodeRequest):
    print(f"Analyzing: {request.filename}")
    lang = detect_lang(request.filename)
    cc_before = cyclomatic_complexity(request.code, lang)

    detect_resp = await detect(DetectRequest(filename=request.filename, code=request.code))

    if detect_resp.pattern == "Clean Code":
        return RefactorSuggestion(
            pattern="Clean Code", confidence=1.0,
            refactored_code=request.code,
            explanation=detect_resp.explanation,
            language=lang,
            complexity_before=cc_before, complexity_after=cc_before,
        )

    refactor_resp = await refactor(RefactorRequest(
        language=lang,
        pattern=detect_resp.pattern,
        fragment=detect_resp.fragment,
        original_code=request.code,
        fragment_offset=detect_resp.fragment_offset,
        fragment_line_count=detect_resp.fragment_line_count,
    ))

    return RefactorSuggestion(
        pattern=detect_resp.pattern,
        confidence=refactor_resp.confidence,
        refactored_code=refactor_resp.refactored_code,
        explanation=detect_resp.explanation,
        language=lang,
        complexity_before=cc_before,
        complexity_after=refactor_resp.complexity_after,
    )


@app.get("/health")
async def health():
    return {"status": "ok", "device": device, "model": BASE_MODEL_DIR, "adapter": ADAPTER_DIR}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
