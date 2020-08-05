from django.utils.functional import SimpleLazyObject

from user_agents import parse

from ..utils.context_processors import LeftFrameProcessor


class MobileDetectionMiddleware:
    # Simple middleware to detect if the user is using a mobile device.
    def __init__(self, get_response):
        self.get_response = get_response  # One-time configuration and initialization.

    def __call__(self, request):
        ua_string = request.headers.get("User-Agent")
        user_agent = parse(ua_string)
        request.is_mobile = user_agent.is_mobile

        # Code to be executed for each request before
        # the view (and later middleware) are called.
        response = self.get_response(request)

        # Code to be executed for each request/response after
        # the view is called.
        return response


class LeftFrameMiddleware:
    """Injects left frame to context data."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return response

    def process_template_response(self, request, response):
        response.context_data["left_frame"] = (
            SimpleLazyObject(LeftFrameProcessor(request, response).get_context) if not request.is_mobile else {}
        )
        return response
