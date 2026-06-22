"""
Clustering service — pure Python k-means implementation for geographic
stop clustering across multiple drivers.

No scikit-learn dependency. Works on 2D lat/lng coordinates with
balance constraints to ensure fair distribution.
"""
import math
import random
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def cluster_stops(
    stops: list[dict],
    k: int,
    max_iterations: int = 100,
    balance_tolerance: int = 2,
) -> list[list[str]]:
    """
    Run balanced k-means clustering on geographic points.

    Args:
        stops: List of dicts with "orderId", "latitude", "longitude"
        k: Number of clusters (= number of drivers)
        max_iterations: Maximum iterations before stopping
        balance_tolerance: Max deviation from mean cluster size (±tolerance)

    Returns:
        k lists of order IDs, one per cluster
    """
    n = len(stops)

    # Edge cases
    if n == 0:
        return [[] for _ in range(k)]

    if k <= 0:
        return [list(s["orderId"] for s in stops)]

    if n <= k:
        # Fewer stops than drivers — put all in one cluster
        return [[s["orderId"] for s in stops]] + [[] for _ in range(k - 1)]

    # Extract coordinates
    points = [(s["latitude"], s["longitude"]) for s in stops]
    order_ids = [s["orderId"] for s in stops]

    # Initialize centroids using k-means++
    centroids = _kmeans_plus_plus_init(points, k)

    # Iterative assignment and update
    assignments = [0] * n
    for iteration in range(max_iterations):
        # Assignment step — each point to nearest centroid
        new_assignments = _assign_to_nearest(points, centroids)

        # Apply balance constraint
        new_assignments = _enforce_balance(
            points, centroids, new_assignments, k, n, balance_tolerance
        )

        # Check convergence
        if new_assignments == assignments and iteration > 0:
            break

        assignments = new_assignments

        # Update centroids
        centroids = _recompute_centroids(points, assignments, k)

    # Group order IDs by cluster
    clusters = [[] for _ in range(k)]
    for i, cluster_idx in enumerate(assignments):
        clusters[cluster_idx].append(order_ids[i])

    logger.info(
        f"Clustering complete: {n} stops into {k} clusters "
        f"(sizes: {[len(c) for c in clusters]})"
    )
    return clusters


def _kmeans_plus_plus_init(points: list[tuple], k: int) -> list[tuple]:
    """
    K-means++ initialization — spread initial centroids for better convergence.
    """
    n = len(points)
    centroids = [points[random.randint(0, n - 1)]]

    for _ in range(1, k):
        # Compute distances to nearest existing centroid
        distances = []
        for p in points:
            min_dist = min(_euclidean_dist(p, c) for c in centroids)
            distances.append(min_dist ** 2)

        # Choose next centroid with probability proportional to distance²
        total = sum(distances)
        if total == 0:
            # All points at same location
            centroids.append(points[random.randint(0, n - 1)])
            continue

        threshold = random.random() * total
        cumulative = 0
        for i, d in enumerate(distances):
            cumulative += d
            if cumulative >= threshold:
                centroids.append(points[i])
                break

    return centroids


def _assign_to_nearest(
    points: list[tuple], centroids: list[tuple]
) -> list[int]:
    """Assign each point to its nearest centroid."""
    assignments = []
    for p in points:
        min_dist = float("inf")
        min_idx = 0
        for j, c in enumerate(centroids):
            d = _euclidean_dist(p, c)
            if d < min_dist:
                min_dist = d
                min_idx = j
        assignments.append(min_idx)
    return assignments


def _enforce_balance(
    points: list[tuple],
    centroids: list[tuple],
    assignments: list[int],
    k: int,
    n: int,
    tolerance: int,
) -> list[int]:
    """
    Enforce balance constraint: no cluster should have more than
    ceil(n/k) + tolerance or fewer than floor(n/k) - tolerance stops.
    Moves furthest points from overfull clusters to underfull ones.
    """
    max_size = math.ceil(n / k) + tolerance
    min_size = max(0, math.floor(n / k) - tolerance)

    # Count cluster sizes
    sizes = [0] * k
    for a in assignments:
        sizes[a] += 1

    # Iteratively fix imbalances
    for _ in range(n):  # Safety limit
        # Find overfull cluster
        overfull = None
        for j in range(k):
            if sizes[j] > max_size:
                overfull = j
                break

        if overfull is None:
            break  # All balanced

        # Find underfull cluster
        underfull = None
        min_count = n + 1
        for j in range(k):
            if j != overfull and sizes[j] < min_count:
                min_count = sizes[j]
                underfull = j

        if underfull is None:
            break

        # Move furthest point from overfull to underfull
        max_dist = -1
        move_idx = -1
        for i, a in enumerate(assignments):
            if a == overfull:
                d = _euclidean_dist(points[i], centroids[overfull])
                if d > max_dist:
                    max_dist = d
                    move_idx = i

        if move_idx >= 0:
            assignments[move_idx] = underfull
            sizes[overfull] -= 1
            sizes[underfull] += 1

    return assignments


def _recompute_centroids(
    points: list[tuple], assignments: list[int], k: int
) -> list[tuple]:
    """Recompute centroids as mean of assigned points."""
    centroids = []
    for j in range(k):
        cluster_points = [points[i] for i, a in enumerate(assignments) if a == j]
        if cluster_points:
            lat_mean = sum(p[0] for p in cluster_points) / len(cluster_points)
            lng_mean = sum(p[1] for p in cluster_points) / len(cluster_points)
            centroids.append((lat_mean, lng_mean))
        else:
            # Empty cluster — keep a random point
            centroids.append(points[random.randint(0, len(points) - 1)])
    return centroids


def _euclidean_dist(a: tuple, b: tuple) -> float:
    """Euclidean distance between two (lat, lng) points."""
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
