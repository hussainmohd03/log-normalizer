from typing import Any

from app.postprocess.lookups.vendors import lookup_vendor
from app.postprocess.result import RuleResult


_OCSF_VERSION = "1.7.0"


def force_metadata_version(ocsf: dict[str, Any]) -> RuleResult:
    result = RuleResult()
    metadata = ocsf.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
        ocsf["metadata"] = metadata

    if metadata.get("version") != _OCSF_VERSION:
        metadata["version"] = _OCSF_VERSION
        result.fixes.append(f"forced metadata.version to {_OCSF_VERSION}")

    return result


def force_vendor_name(ocsf: dict[str, Any], source: str) -> RuleResult:
    result = RuleResult()
    canonical = lookup_vendor(source)
    if canonical is None:
        return result

    metadata = ocsf.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
        ocsf["metadata"] = metadata

    product = metadata.get("product")
    if not isinstance(product, dict):
        product = {}
        metadata["product"] = product

    current = product.get("vendor_name")
    if current and current.strip().lower() != "unknown":
        return result

    product["vendor_name"] = canonical
    result.fixes.append(
        f"set metadata.product.vendor_name to {canonical} from source {source}"
    )
    return result


def _find_mail_message_entities(raw_alert: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(raw_alert, dict):
        return []
    entities = raw_alert.get("entities")
    if not isinstance(entities, list):
        alert = raw_alert.get("alert")
        if isinstance(alert, dict):
            entities = alert.get("entities")
    if not isinstance(entities, list):
        return []
    return [
        e for e in entities
        if isinstance(e, dict) and str(e.get("kind", "")).lower() == "mailmessage"
    ]


def _email_indices(ocsf: dict[str, Any]) -> list[int]:
    evidences = ocsf.get("evidences")
    if not isinstance(evidences, list):
        return []
    return [
        idx for idx, e in enumerate(evidences)
        if isinstance(e, dict) and isinstance(e.get("email"), dict)
    ]


def enrich_email_from_raw_alert(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
) -> RuleResult:
    result = RuleResult()
    email_indices = _email_indices(ocsf)
    if not email_indices:
        return result

    mail_entities = _find_mail_message_entities(raw_alert)
    if not mail_entities:
        return result

    evidences = ocsf["evidences"]
    for slot, idx in enumerate(email_indices):
        if slot >= len(mail_entities):
            break
        entity = mail_entities[slot]
        props = entity.get("properties") if isinstance(entity.get("properties"), dict) else entity
        if not isinstance(props, dict):
            continue

        email = evidences[idx]["email"]
        added: list[str] = []

        internet_id = props.get("internetMessageId") or props.get("InternetMessageId")
        if internet_id and not email.get("message_uid"):
            email["message_uid"] = internet_id
            added.append("message_uid")

        sender_ip = props.get("senderIP") or props.get("SenderIP")
        if sender_ip and not email.get("x_originating_ip"):
            email["x_originating_ip"] = [sender_ip] if isinstance(sender_ip, str) else list(sender_ip)
            added.append("x_originating_ip")

        if added:
            result.fixes.append(
                f"enriched email[{idx}] with {{{', '.join(added)}}} from raw alert"
            )

    return result


def run_enrichment_rules(
    ocsf: dict[str, Any],
    raw_alert: dict[str, Any],
    source: str,
) -> RuleResult:
    result = RuleResult()
    result.merge(force_metadata_version(ocsf))
    result.merge(force_vendor_name(ocsf, source))
    result.merge(enrich_email_from_raw_alert(ocsf, raw_alert))
    return result
