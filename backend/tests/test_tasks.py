from app.main import app
from app.utils.dependencies import get_current_user


def test_tasks_can_be_created_and_edited_without_a_date(client, test_user):
    app.dependency_overrides[get_current_user] = lambda: test_user

    created = client.post("/api/v1/tasks", json={"titre": "Ranger la réserve"})
    assert created.status_code == 201
    task = created.json()
    assert task["date_debut"] is None
    assert task["statut"] == "en_attente"
    task_url = f"/api/v1/tasks/{task['id_tache']}"

    filters = {"start_date": "2026-11-09T00:00:00Z", "end_date": "2026-11-11T00:00:00Z"}
    assert client.get("/api/v1/tasks", params=filters).json() == []

    scheduled = client.put(task_url, json={"date_debut": "2026-11-10", "est_toute_la_journee": True})
    assert scheduled.status_code == 200
    assert client.get("/api/v1/tasks", params=filters).json()[0]["id_tache"] == task["id_tache"]

    assert client.put(task_url, json={"statut": "complete"}).status_code == 200
    edited = client.put(task_url, json={"titre": "Ranger le dépôt", "date_debut": None, "date_fin": None})
    assert edited.status_code == 200
    assert edited.json()["statut"] == "complete"
    assert edited.json()["date_debut"] is None
    assert client.get("/api/v1/tasks", params=filters).json() == []
    assert client.get("/api/v1/tasks").json()[0]["titre"] == "Ranger le dépôt"
