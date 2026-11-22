"""Engine side of the shared exercise-catalog cases (src/utils/exerciseCatalog.cases.json).
The app's exerciseCatalog.test.js checks the same file, so canon() can't drift."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from engine import log_ingest as L
from engine import muscle_map as M

cases = json.loads((Path(__file__).parents[1] / "src/utils/exerciseCatalog.cases.json").read_text())
bad = [(n, L.canon(n), e) for n, e in cases["canon"].items() if L.canon(n) != e]
assert not bad, bad
assert M.get_muscle_credit("Bench Press (Top Set)") == {"chest": 1.0, "triceps": 0.5, "shoulders": 0.5}
assert M.get_muscle_credit("Push-up Pyramid") == {}
assert L.canon("Leg Extensions") == L.canon("Leg Extension") == "Leg Extension"
print(f"exercise catalog: {len(cases['canon'])} shared cases OK")
