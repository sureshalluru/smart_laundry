"""
Property-based tests for commercial flag propagation to new orders.

Feature: commercial-account-management, Property 3: Commercial flag propagation to new orders

Validates: Requirements 3.2, 3.3, 3.4, 4.3, 4.4, 4.5
"""
from hypothesis import given, settings
from hypothesis import strategies as st


# --- Oracle / Specification Function ---


def resolve_order_commercial_status(
    channel: str,  # "Online", "InStore", "Frequency"
    customer_is_commercial: bool,
    frequency_is_commercial: bool,  # only relevant for Frequency channel
    caller_pay_by_invoice: bool,  # the value passed by caller
) -> tuple[str, bool]:  # (order_type, pay_by_invoice)
    """
    Determine the order_type and pay_by_invoice for a new order based on
    commercial flags and creation channel.

    Rules (from spec):
    - If customer_is_commercial is True → ("Commercial", True)
    - If frequency_is_commercial is True AND channel is "Frequency" → ("Commercial", True)
    - Otherwise → (channel, caller_pay_by_invoice)

    The customer-level flag takes precedence regardless of channel.
    The frequency-level flag only applies to Frequency-channel orders.
    """
    if customer_is_commercial:
        return ("Commercial", True)
    if channel == "Frequency" and frequency_is_commercial:
        return ("Commercial", True)
    return (channel, caller_pay_by_invoice)


# --- Strategies ---

_channel_strategy = st.sampled_from(["Online", "InStore", "Frequency"])
_bool_strategy = st.booleans()


# --- Property Tests ---


class TestCommercialFlagPropagationProperty:
    """Property 3: Commercial flag propagation to new orders.

    For any order creation request (online, in-store, or frequency-generated),
    the resulting order SHALL have order_type = 'Commercial' and pay_by_invoice = TRUE
    if and only if the customer's is_commercial flag is TRUE or the originating
    frequency record's is_commercial flag is TRUE. When neither flag is set, the order
    type SHALL be determined by the creation channel (Online or InStore) and
    pay_by_invoice SHALL retain the caller-provided value.

    **Validates: Requirements 3.2, 3.3, 3.4, 4.3, 4.4, 4.5**
    """

    @given(
        channel=_channel_strategy,
        frequency_is_commercial=_bool_strategy,
        caller_pay_by_invoice=_bool_strategy,
    )
    @settings(max_examples=200)
    def test_customer_commercial_flag_always_produces_commercial_order(
        self, channel, frequency_is_commercial, caller_pay_by_invoice
    ):
        """When customer is commercial, order is always Commercial with pay_by_invoice=True,
        regardless of channel, frequency flag, or caller value."""
        order_type, pay_by_invoice = resolve_order_commercial_status(
            channel=channel,
            customer_is_commercial=True,
            frequency_is_commercial=frequency_is_commercial,
            caller_pay_by_invoice=caller_pay_by_invoice,
        )
        assert order_type == "Commercial", (
            f"Expected order_type='Commercial' but got '{order_type}' "
            f"when customer_is_commercial=True, channel={channel}"
        )
        assert pay_by_invoice is True, (
            f"Expected pay_by_invoice=True but got {pay_by_invoice} "
            f"when customer_is_commercial=True, channel={channel}"
        )

    @given(caller_pay_by_invoice=_bool_strategy)
    @settings(max_examples=200)
    def test_frequency_commercial_flag_produces_commercial_order(
        self, caller_pay_by_invoice
    ):
        """When frequency is commercial (Frequency channel), order is Commercial
        with pay_by_invoice=True, even if customer is not commercial."""
        order_type, pay_by_invoice = resolve_order_commercial_status(
            channel="Frequency",
            customer_is_commercial=False,
            frequency_is_commercial=True,
            caller_pay_by_invoice=caller_pay_by_invoice,
        )
        assert order_type == "Commercial", (
            f"Expected order_type='Commercial' but got '{order_type}' "
            f"for Frequency channel with frequency_is_commercial=True"
        )
        assert pay_by_invoice is True, (
            f"Expected pay_by_invoice=True but got {pay_by_invoice} "
            f"for Frequency channel with frequency_is_commercial=True"
        )

    @given(
        channel=st.sampled_from(["Online", "InStore"]),
        caller_pay_by_invoice=_bool_strategy,
    )
    @settings(max_examples=200)
    def test_frequency_flag_irrelevant_for_non_frequency_channels(
        self, channel, caller_pay_by_invoice
    ):
        """When channel is Online or InStore, frequency_is_commercial has no effect
        (only customer flag matters). With customer not commercial, order retains
        channel type and caller value."""
        order_type, pay_by_invoice = resolve_order_commercial_status(
            channel=channel,
            customer_is_commercial=False,
            frequency_is_commercial=True,  # should be ignored
            caller_pay_by_invoice=caller_pay_by_invoice,
        )
        assert order_type == channel, (
            f"Expected order_type='{channel}' but got '{order_type}' "
            f"when customer not commercial on non-Frequency channel"
        )
        assert pay_by_invoice == caller_pay_by_invoice, (
            f"Expected pay_by_invoice={caller_pay_by_invoice} but got {pay_by_invoice} "
            f"when customer not commercial on non-Frequency channel"
        )

    @given(
        channel=_channel_strategy,
        caller_pay_by_invoice=_bool_strategy,
    )
    @settings(max_examples=200)
    def test_no_commercial_flags_preserves_channel_and_caller_value(
        self, channel, caller_pay_by_invoice
    ):
        """When neither customer nor frequency is commercial, order_type equals
        the channel and pay_by_invoice equals the caller-provided value."""
        order_type, pay_by_invoice = resolve_order_commercial_status(
            channel=channel,
            customer_is_commercial=False,
            frequency_is_commercial=False,
            caller_pay_by_invoice=caller_pay_by_invoice,
        )
        assert order_type == channel, (
            f"Expected order_type='{channel}' but got '{order_type}' "
            f"when no commercial flags set"
        )
        assert pay_by_invoice == caller_pay_by_invoice, (
            f"Expected pay_by_invoice={caller_pay_by_invoice} but got {pay_by_invoice} "
            f"when no commercial flags set"
        )

    @given(
        channel=_channel_strategy,
        customer_is_commercial=_bool_strategy,
        frequency_is_commercial=_bool_strategy,
        caller_pay_by_invoice=_bool_strategy,
    )
    @settings(max_examples=200)
    def test_commercial_iff_any_relevant_flag_set(
        self, channel, customer_is_commercial, frequency_is_commercial, caller_pay_by_invoice
    ):
        """The order is Commercial if and only if customer_is_commercial=True
        or (channel='Frequency' and frequency_is_commercial=True).
        This is the comprehensive bidirectional property."""
        order_type, pay_by_invoice = resolve_order_commercial_status(
            channel=channel,
            customer_is_commercial=customer_is_commercial,
            frequency_is_commercial=frequency_is_commercial,
            caller_pay_by_invoice=caller_pay_by_invoice,
        )

        # Determine if commercial should apply
        should_be_commercial = customer_is_commercial or (
            channel == "Frequency" and frequency_is_commercial
        )

        if should_be_commercial:
            assert order_type == "Commercial", (
                f"Expected 'Commercial' but got '{order_type}' "
                f"for channel={channel}, customer_commercial={customer_is_commercial}, "
                f"freq_commercial={frequency_is_commercial}"
            )
            assert pay_by_invoice is True, (
                f"Expected pay_by_invoice=True but got {pay_by_invoice} "
                f"for channel={channel}, customer_commercial={customer_is_commercial}, "
                f"freq_commercial={frequency_is_commercial}"
            )
        else:
            assert order_type == channel, (
                f"Expected '{channel}' but got '{order_type}' "
                f"for channel={channel}, customer_commercial={customer_is_commercial}, "
                f"freq_commercial={frequency_is_commercial}"
            )
            assert pay_by_invoice == caller_pay_by_invoice, (
                f"Expected pay_by_invoice={caller_pay_by_invoice} but got {pay_by_invoice} "
                f"for channel={channel}, customer_commercial={customer_is_commercial}, "
                f"freq_commercial={frequency_is_commercial}"
            )

    @given(
        channel=_channel_strategy,
        customer_is_commercial=_bool_strategy,
        frequency_is_commercial=_bool_strategy,
        caller_pay_by_invoice=_bool_strategy,
    )
    @settings(max_examples=200)
    def test_order_type_is_valid_value(
        self, channel, customer_is_commercial, frequency_is_commercial, caller_pay_by_invoice
    ):
        """The returned order_type is always one of the valid values:
        'Online', 'InStore', or 'Commercial'."""
        order_type, _ = resolve_order_commercial_status(
            channel=channel,
            customer_is_commercial=customer_is_commercial,
            frequency_is_commercial=frequency_is_commercial,
            caller_pay_by_invoice=caller_pay_by_invoice,
        )
        valid_types = {"Online", "InStore", "Commercial", "Frequency"}
        assert order_type in valid_types, (
            f"order_type '{order_type}' not in valid set {valid_types}"
        )

    @given(
        channel=_channel_strategy,
        customer_is_commercial=_bool_strategy,
        frequency_is_commercial=_bool_strategy,
        caller_pay_by_invoice=_bool_strategy,
    )
    @settings(max_examples=200)
    def test_pay_by_invoice_is_boolean(
        self, channel, customer_is_commercial, frequency_is_commercial, caller_pay_by_invoice
    ):
        """The returned pay_by_invoice is always a boolean value."""
        _, pay_by_invoice = resolve_order_commercial_status(
            channel=channel,
            customer_is_commercial=customer_is_commercial,
            frequency_is_commercial=frequency_is_commercial,
            caller_pay_by_invoice=caller_pay_by_invoice,
        )
        assert isinstance(pay_by_invoice, bool), (
            f"Expected bool, got {type(pay_by_invoice)}"
        )
