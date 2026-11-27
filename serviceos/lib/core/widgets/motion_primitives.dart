import 'package:flutter/material.dart';

/// Staggered scroll-aware entrance wrapper for cards and list sections.
class ScrollRevealItem extends StatelessWidget {
  final Widget child;
  final int index;
  final Duration duration;
  final double slideOffset;

  const ScrollRevealItem({
    super.key,
    required this.child,
    this.index = 0,
    this.duration = const Duration(milliseconds: 420),
    this.slideOffset = 22.0,
  });

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduceMotion) return child;

    final clampedDelayMs = (index * 45).clamp(0, 270);
    final totalDuration = duration + Duration(milliseconds: clampedDelayMs);

    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: totalDuration,
      curve: Curves.easeOutCubic,
      builder: (context, value, childWidget) {
        final delayFraction =
            totalDuration.inMilliseconds == 0 ? 0.0 : clampedDelayMs / totalDuration.inMilliseconds;
        final progress = value <= delayFraction
            ? 0.0
            : ((value - delayFraction) / (1.0 - delayFraction)).clamp(0.0, 1.0);
        return Opacity(
          opacity: progress,
          child: Transform.translate(
            offset: Offset(0, (1.0 - progress) * slideOffset),
            child: childWidget,
          ),
        );
      },
      child: child,
    );
  }
}

/// Tactile press-down scale wrapper providing subtle spring-like feedback on cards.
class TactileScaleCard extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final BorderRadius borderRadius;

  const TactileScaleCard({
    super.key,
    required this.child,
    this.onTap,
    this.borderRadius = const BorderRadius.all(Radius.circular(16)),
  });

  @override
  State<TactileScaleCard> createState() => _TactileScaleCardState();
}

class _TactileScaleCardState extends State<TactileScaleCard> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: (_isPressed && !reduceMotion) ? 0.982 : 1.0,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutCubic,
        child: ClipRRect(
          borderRadius: widget.borderRadius,
          child: widget.child,
        ),
      ),
    );
  }
}

/// Pulsing live status dot for dispatch radar and technician duty states.
class PulsingStatusDot extends StatefulWidget {
  final Color color;
  final double size;
  final bool isActive;

  const PulsingStatusDot({
    super.key,
    required this.color,
    this.size = 10.0,
    this.isActive = true,
  });

  @override
  State<PulsingStatusDot> createState() => _PulsingStatusDotState();
}

class _PulsingStatusDotState extends State<PulsingStatusDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    if (widget.isActive) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant PulsingStatusDot oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !_controller.isAnimating) {
      _controller.repeat();
    } else if (!widget.isActive && _controller.isAnimating) {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (!widget.isActive || reduceMotion) {
      return Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
        ),
      );
    }

    return SizedBox(
      width: widget.size * 2.2,
      height: widget.size * 2.2,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final haloScale = 1.0 + _controller.value * 1.1;
          final haloOpacity = (1.0 - _controller.value) * 0.45;
          return Stack(
            alignment: Alignment.center,
            children: [
              Transform.scale(
                scale: haloScale,
                child: Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    color: widget.color.withOpacity(haloOpacity),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              Container(
                width: widget.size,
                height: widget.size,
                decoration: BoxDecoration(
                  color: widget.color,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Animated section heading with optional trailing action link.
class AnimatedSectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onActionTap;
  final Color titleColor;
  final Color actionColor;

  const AnimatedSectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onActionTap,
    required this.titleColor,
    required this.actionColor,
  });

  @override
  Widget build(BuildContext context) {
    return ScrollRevealItem(
      slideOffset: 12,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: titleColor,
              letterSpacing: -0.3,
            ),
          ),
          if (actionLabel != null && onActionTap != null)
            InkWell(
              onTap: onActionTap,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      actionLabel!,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: actionColor,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(Icons.arrow_forward_rounded, size: 15, color: actionColor),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
