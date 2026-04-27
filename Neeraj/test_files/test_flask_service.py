from flask import Flask, request, jsonify
from functools import wraps

app = Flask(__name__)

def require_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")
        return f(*args, **kwargs)
    return decorated

@app.route("/api/v1/orders", methods=["GET"])
def get_orders():
    return jsonify([])

@app.route("/api/v1/orders", methods=["POST"])
def create_order():
    return jsonify({"created": True})

@app.route("/api/v1/orders/<int:order_id>", methods=["GET", "DELETE"])
def order_detail(order_id):
    return jsonify({"order_id": order_id})

@app.route("/internal/admin/reset", methods=["POST"])
@require_token
def admin_reset():
    return jsonify({"reset": True})

@app.route("/health")
def health():
    return "ok"
