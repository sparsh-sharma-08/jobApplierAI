def profile_to_dict(profile) -> dict:
    return {
        "name": profile.name,
        "email": profile.email,
        "phone": profile.phone,
        "location": profile.location,
        "linkedin": profile.linkedin,
        "github": profile.github,
        "skills": profile.skills or [],
        "experience_level": profile.experience_level,
        "preferred_roles": profile.preferred_roles or [],
        "preferred_locations": profile.preferred_locations or [],
        "remote_preference": profile.remote_preference,
        "min_salary": profile.min_salary,
        "target_companies": profile.target_companies or [],
    }
